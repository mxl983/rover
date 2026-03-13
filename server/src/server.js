import express from "express";
import https from "https";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import config from "./config.js";
import { mqttService } from "./services/mqttService.js";
import { driverService } from "./services/driverService.js";
import { stateService } from "./services/stateService.js";
import cameraRoutes from "./routes/camera.js";
import systemRoutes from "./routes/system.js";
import controlRoutes from "./routes/control.js";
import { speak } from "./utils/sysUtils.js";
import {
  initTelemetry,
  recordTelemetry,
  getTelemetry,
  closeTelemetry,
} from "./services/telemetryService.js";
import { success, error } from "./utils/apiResponse.js";
import { logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to pub-sub service
mqttService.connect();

driverService.start();
initTelemetry();

function onShutdown() {
  closeTelemetry();
  process.exit(0);
}
process.on("SIGTERM", onShutdown);
process.on("SIGINT", onShutdown);

//
let LAST_CHECK_TIME = Date.now();
const STARTUP_TIME = Date.now();
let LAST_TELEMETRY_WRITE = 0;

// Clock sync grace period
const GRACE_PERIOD_MS = 2 * 60 * 1000;

// Time it takes until system entering power saving mode
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// Set allowed origin
const corsOptions = {
  origin: config.cors.origins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
};

const app = express();
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

const server =
  config.ssl.enabled && sslOptions
    ? https.createServer(sslOptions, app)
    : http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(cors(corsOptions));
app.use("/api/camera", cameraRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/control", controlRoutes);
app.use("/photos", express.static(path.join(__dirname, "..", "photos")));
app.options(/(.*)/, cors(corsOptions));

app.get("/healthz", (req, res) => {
  success(res, { status: "ok", uptime: process.uptime(), env: config.env });
});

app.get("/api/telemetry", (req, res) => {
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 100), 1000);
  const since = req.query.since || null;
  const data = getTelemetry({ limit, since });
  success(res, { telemetry: data });
});

app.use((req, res, next) => {
  res.status(404).json({ success: false, error: "Not found" });
});

app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, "Unhandled error");
  error(
    res,
    config.env === "production" ? "Internal server error" : err.message,
    500,
  );
});

// playSystemAudio('system_online.mp3');

// System status update cycle
setInterval(() => {
  const now = Date.now();
  const timeSinceStartup = now - STARTUP_TIME;

  // Ignore heartbeat detection before clock is ready
  if (now - LAST_CHECK_TIME > 15000) {
    mqttService.log(`[PI] Clock jump detected (NTP sync). Resetting timers...`);
    stateService.lastPingTimestamp = now;
  }
  LAST_CHECK_TIME = now;

  // Power saving
  const timeSinceLastPing = now - stateService.lastPingTimestamp;
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
    timeSinceStartup > 10_000 && // wait 10s after server online
    now - LAST_TELEMETRY_WRITE >= 60_000 // then once per minute
  ) {
    recordTelemetry(health);
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

  // Broadcast health state
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}, 1000);

wss.on("connection", (ws) => {
  logger.info("New browser client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "PING") {
        stateService.lastPingTimestamp = Date.now();
        ws.send(JSON.stringify({ type: "PONG" }));
      }
      } catch (err) {
        logger.warn(
          { err, raw: message.toString() },
          "Invalid JSON received from WebSocket client",
        );
      }
  });

  ws.on("close", () => logger.info("Client disconnected"));
});

const { port, host } = config.server;
const protocol = config.ssl.enabled && sslOptions ? "https" : "http";

server.listen(port, host, () => {
  logger.info({ host, port, protocol }, "Server listening");
  speak("System online");
});

async function handleIdleShutdown() {
  stateService.isShuttingDown = true;
  logger.warn("SYSTEM IDLE: Initiating shutdown...");

  try {
    // Final telemetry snapshot right before auto-shutdown
    const health = stateService.getHealth();
    if (health && Object.keys(health).length) {
      recordTelemetry(health);
    }

    mqttService.triggerIdleShutdown({
      lastPing: stateService.lastPingTimestamp,
      uptime: Date.now() - stateService.startupTime,
      battery: stateService.currentBatteryPct,
    });

    // Signal the Pi host via the shared volume
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
