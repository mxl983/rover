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
    dbPath: process.env.TELEMETRY_DB_PATH || "/app/data/telemetry.db",
    /** Keep data for this many days; older rows in telemetry and client_connections are deleted. Set TELEMETRY_RETENTION_DAYS to override. */
    retentionDays: parseNumber(process.env.TELEMETRY_RETENTION_DAYS, 7),
  },
};

export default config;
export { config };

