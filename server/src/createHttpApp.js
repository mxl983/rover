import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cameraRoutes from "./routes/camera.js";
import systemRoutes from "./routes/system.js";
import controlRoutes from "./routes/control.js";
import voiceRoutes from "./routes/voice.js";
import { getTelemetry } from "./services/telemetryService.js";
import { success, error } from "./utils/apiResponse.js";
import { logger } from "./utils/logger.js";
import config from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Express app only (no listen, no WebSocket). Used by production server and tests.
 * @param {object} [options]
 * @param {typeof getTelemetry} [options.getTelemetry] - override telemetry reader (tests)
 * @param {object} [options.config] - override config (tests)
 * @param {string} [options.staticPhotosDir] - override /photos static root
 */
export function createHttpApp(options = {}) {
  const getTelemetryFn = options.getTelemetry ?? getTelemetry;
  const cfg = options.config ?? config;
  const photosDir =
    options.staticPhotosDir ?? path.join(__dirname, "..", "photos");

  const corsOptions = {
    origin: cfg.cors.origins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  };

  const app = express();
  app.use(express.json());
  app.use(cors(corsOptions));
  app.use("/api/camera", cameraRoutes);
  app.use("/api/system", systemRoutes);
  app.use("/api/control", controlRoutes);
  app.use("/api/voice", voiceRoutes);
  app.use("/photos", express.static(photosDir));
  app.options(/(.*)/, cors(corsOptions));

  app.get("/healthz", (req, res) => {
    success(res, { status: "ok", uptime: process.uptime(), env: cfg.env });
  });

  app.get("/api/telemetry", (req, res) => {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 100), 1000);
    const since = req.query.since || null;
    const data = getTelemetryFn({ limit, since });
    success(res, { telemetry: data });
  });

  app.use((req, res) => {
    res.status(404).json({ success: false, error: "Not found" });
  });

  app.use((err, req, res, next) => {
    logger.error({ err, path: req.path }, "Unhandled error");
    error(
      res,
      cfg.env === "production" ? "Internal server error" : err.message,
      500,
    );
  });

  return app;
}
