import { describe, it, expect, vi, afterEach } from "vitest";

const envKeys = [
  "PORT",
  "SSL_ENABLED",
  "TELEMETRY_ENABLED",
  "TELEMETRY_DB_PATH",
  "CORS_ORIGINS",
  "DEEPSEEK_API_KEY",
];

describe("config", () => {
  const snapshot = {};

  afterEach(() => {
    for (const k of envKeys) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
    vi.resetModules();
  });

  it("parses PORT and SSL_ENABLED", async () => {
    for (const k of envKeys) snapshot[k] = process.env[k];
    process.env.PORT = "4001";
    process.env.SSL_ENABLED = "false";
    vi.resetModules();
    const { default: cfg } = await import("./config.js");
    expect(cfg.server.port).toBe(4001);
    expect(cfg.ssl.enabled).toBe(false);
  });

  it("defaults telemetry enabled", async () => {
    for (const k of envKeys) snapshot[k] = process.env[k];
    delete process.env.TELEMETRY_ENABLED;
    vi.resetModules();
    const { default: cfg } = await import("./config.js");
    expect(cfg.telemetry.enabled).toBe(true);
  });
});
