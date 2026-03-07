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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to pub-sub service
mqttService.connect();

// Start python child process
driverService.start();

//
let LAST_CHECK_TIME = Date.now();
const STARTUP_TIME = Date.now();

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
    console.error(
      "Failed to load SSL certificates, falling back to HTTP:",
      err.message,
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
  res.json({
    status: "ok",
    uptime: process.uptime(),
    env: config.env,
  });
});

app.use((req, res, next) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

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

  const payload = {
    type: "HEALTH_UPDATE",
    data: {
      ...stateService.getHealth(),
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
  console.log("New browser client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "PING") {
        stateService.lastPingTimestamp = Date.now();
        ws.send(JSON.stringify({ type: "PONG" }));
      }
    } catch (err) {
      console.error("Invalid JSON received:", message.toString());
    }
  });

  ws.on("close", () => console.log("Client disconnected"));
});

const { port, host } = config.server;
const protocol = config.ssl.enabled && sslOptions ? "https" : "http";

server.listen(port, host, () => {
  console.log(`Server running on ${protocol}://${host}:${port}`);
});

async function handleIdleShutdown() {
  stateService.isShuttingDown = true;
  console.log("🚨 SYSTEM IDLE: Initiating shutdown...");

  try {
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
      process.exit(0);
    }, 3000);
  } catch (err) {
    console.error("Shutdown sequence failed:", err);
    stateService.isShuttingDown = false;
  }
}
