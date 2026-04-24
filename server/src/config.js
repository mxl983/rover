import "dotenv/config";

const parseNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
};

const parseOrigins = (value, fallback) => {
  const raw = value && value.length ? value : fallback;
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
};

const config = {
  env: process.env.NODE_ENV || "development",
  server: {
    port: parseNumber(process.env.PORT, 3000),
    host: process.env.HOST || "0.0.0.0",
  },
  cors: {
    origins: parseOrigins(
      process.env.CORS_ORIGINS,
      "http://localhost:5173,https://mxl983.github.io",
    ),
  },
  ssl: {
    enabled: parseBoolean(process.env.SSL_ENABLED, true),
    keyPath: process.env.SSL_KEY_PATH || "/cert.key",
    certPath: process.env.SSL_CERT_PATH || "/cert.crt",
  },
  mqtt: {
    host:
      process.env.MQTT_HOST ||
      "84f09906a62e42c78c5d9b0555aa71f1.s1.eu.hivemq.cloud",
    port: parseNumber(process.env.MQTT_PORT, 8883),
    protocol: process.env.MQTT_PROTOCOL || "mqtts",
    rejectUnauthorized: parseBoolean(
      process.env.MQTT_REJECT_UNAUTHORIZED,
      false,
    ),
  },
  telemetry: {
    enabled: parseBoolean(process.env.TELEMETRY_ENABLED, true),
    relayUrl:
      process.env.TELEMETRY_RELAY_URL ||
      "https://jjcloud.tail9d0237.ts.net:8787",
    relayToken: process.env.RELAY_API_TOKEN || process.env.ROVER_API_TOKEN || "",
    relayTimeoutMs: parseNumber(process.env.TELEMETRY_RELAY_TIMEOUT_MS, 3000),
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    timeoutMs: parseNumber(process.env.DEEPSEEK_TIMEOUT_MS, 12_000),
  },
  /** When true, log full DeepSeek request body and raw HTTP response (noisy). */
  voiceLlmDebug: parseBoolean(process.env.VOICE_LLM_DEBUG, false),
  /**
   * Timed voice drive: map “前进 N 米” to duration from estimated floor speed (m/s).
   * Tune VOICE_LINEAR_SPEED_MPS if real distance is short (lower speed) or long (raise speed).
   */
  voiceDrive: {
    estimatedLinearSpeedMps: parseNumber(process.env.VOICE_LINEAR_SPEED_MPS, 0.2),
    /** Timed analog in-place turn: deg/s (tune from a timed test turn). */
    estimatedTurnDegPerSec: parseNumber(process.env.VOICE_TURN_DEG_PER_SEC, 85),
    maxTimedDriveMs: parseNumber(process.env.VOICE_MAX_TIMED_DRIVE_MS, 15_000),
  },
  camera: {
    photosDir: process.env.CAMERA_PHOTOS_DIR || "/app/photos",
    mediamtxPatchUrl:
      process.env.MEDIAMTX_PATCH_URL ||
      "http://127.0.0.1:9997/v3/config/paths/patch/cam",
  },
};

export default config;
export { config };

