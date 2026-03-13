import pino from "pino";
import config from "../config.js";

const level =
  process.env.LOG_LEVEL || (config.env === "production" ? "info" : "debug");

// Simple, dependency-free logger. Pino writes structured JSON to stdout.
// If you want pretty output during development, you can pipe through pino-pretty
// on your dev machine instead of bundling it into the Pi image.
export const logger = pino({
  level,
  base: { service: "mango-rover-control", env: config.env },
});

export default logger;

