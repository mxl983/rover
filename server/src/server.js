import https from "https";
import http from "http";
import fs from "fs";
import config from "./config.js";
import { mqttService } from "./services/mqttService.js";
import { driverService } from "./services/driverService.js";
import { stateService } from "./services/stateService.js";
import {
  initTelemetry,
  recordTelemetry,
  closeTelemetry,
} from "./services/telemetryService.js";
import { speak } from "./utils/sysUtils.js";
import { logger } from "./utils/logger.js";
import { createHttpApp } from "./createHttpApp.js";
import { attachWebSocketServer } from "./attachWebSocketServer.js";
import { broadcastJsonToClients } from "./utils/wsBroadcast.js";

function validateProductionConfig() {
  if (config.env !== "production") return;
  if (config.ssl.enabled) {
    try {
      fs.accessSync(config.ssl.keyPath, fs.constants.R_OK);
      fs.accessSync(config.ssl.certPath, fs.constants.R_OK);
    } catch {
      logger.error("SSL_ENABLED=true but cert files are missing or unreadable");
      process.exit(1);
    }
  }
}

validateProductionConfig();

mqttService.connect();
driverService.start();
initTelemetry();

function onShutdown() {
  const health = stateService.getHealth?.() ?? {};
  if (health && Object.keys(health).length) {
    recordTelemetry(health, "before_power_down_signal");
  }
  closeTelemetry();
  process.exit(0);
}
process.on("SIGTERM", onShutdown);
process.on("SIGINT", onShutdown);

let LAST_CHECK_TIME = Date.now();
const STARTUP_TIME = Date.now();
let LAST_TELEMETRY_WRITE = 0;

const GRACE_PERIOD_MS = 2 * 60 * 1000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_WARNING_BEFORE_MS = 60 * 1000;
let idleWarningSpoken = false;

let sslOptions;
if (config.ssl.enabled) {
  try {
    sslOptions = {
      key: fs.readFileSync(config.ssl.keyPath),
      cert: fs.readFileSync(config.ssl.certPath),
    };
  } catch (err) {
    logger.error(
      { err },
      "Failed to load SSL certificates, falling back to HTTP",
    );
  }
}

const app = createHttpApp();
const server =
  config.ssl.enabled && sslOptions
    ? https.createServer(sslOptions, app)
    : http.createServer(app);

const wss = attachWebSocketServer(server);

driverService.setBroadcast((payload) => {
  broadcastJsonToClients(wss, payload);
});

setInterval(() => {
  const now = Date.now();
  const timeSinceStartup = now - STARTUP_TIME;

  if (now - LAST_CHECK_TIME > 15000) {
    mqttService.log(`[PI] Clock jump detected (NTP sync). Resetting timers...`);
    stateService.lastPingTimestamp = now;
  }
  LAST_CHECK_TIME = now;

  const timeSinceLastPing = now - stateService.lastPingTimestamp;
  if (timeSinceLastPing < IDLE_TIMEOUT_MS - IDLE_WARNING_BEFORE_MS) {
    idleWarningSpoken = false;
  }
  if (
    timeSinceStartup > GRACE_PERIOD_MS &&
    timeSinceLastPing >= IDLE_TIMEOUT_MS - IDLE_WARNING_BEFORE_MS &&
    timeSinceLastPing < IDLE_TIMEOUT_MS &&
    !idleWarningSpoken &&
    !stateService.isShuttingDown
  ) {
    idleWarningSpoken = true;
    if (!stateService.quietMode) {
      speak("六十秒后若无操作，我将进入休眠以节省电量。", { language: "zh" });
    }
  }
  if (
    timeSinceStartup > GRACE_PERIOD_MS &&
    timeSinceLastPing > IDLE_TIMEOUT_MS &&
    !stateService.isShuttingDown
  ) {
    handleIdleShutdown();
  }

  driverService.sync();

  const health = stateService.getHealth() ?? {};
  if (
    Object.keys(health).length &&
    timeSinceStartup > 10_000 &&
    now - LAST_TELEMETRY_WRITE >= 60_000
  ) {
    recordTelemetry(health, "health_report_scheduled");
    LAST_TELEMETRY_WRITE = now;
  }

  const payload = {
    type: "HEALTH_UPDATE",
    data: {
      ...health,
      timestamp: new Date().toLocaleTimeString(),
      ttl: IDLE_TIMEOUT_MS - timeSinceLastPing,
    },
  };

  broadcastJsonToClients(wss, payload);
}, 1000);

const { port, host } = config.server;
const protocol = config.ssl.enabled && sslOptions ? "https" : "http";

server.listen(port, host, () => {
  logger.info({ host, port, protocol }, "Server listening");
  const health = stateService.getHealth?.() ?? {};
  if (health && Object.keys(health).length) {
    recordTelemetry(health, "power_on");
  }
  if (!stateService.quietMode) speak("系统已上线。", { language: "zh" });
});

async function handleIdleShutdown() {
  stateService.isShuttingDown = true;
  logger.warn("SYSTEM IDLE: Initiating shutdown...");

  try {
    const health = stateService.getHealth();
    if (health && Object.keys(health).length) {
      recordTelemetry(health, "before_power_down_idle");
    }

    mqttService.triggerIdleShutdown({
      lastPing: stateService.lastPingTimestamp,
      uptime: Date.now() - stateService.startupTime,
      battery: stateService.currentBatteryPct,
    });

    fs.writeFileSync(
      "/app/shared/shutdown.req",
      `Idle shutdown at ${new Date().toISOString()}`,
    );

    setTimeout(() => {
      closeTelemetry();
      process.exit(0);
    }, 3000);
  } catch (err) {
    logger.error({ err }, "Shutdown sequence failed");
    stateService.isShuttingDown = false;
  }
}
