import { describe, it, expect, vi, afterEach } from "vitest";

const envKeys = [
  "PORT",
  "SSL_ENABLED",
  "TELEMETRY_ENABLED",
  "TELEMETRY_RELAY_URL",
  "TELEMETRY_RELAY_TIMEOUT_MS",
  "RELAY_API_TOKEN",
  "ROVER_API_TOKEN",
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
    delete process.env.TELEMETRY_RELAY_URL;
    delete process.env.TELEMETRY_RELAY_TIMEOUT_MS;
    vi.resetModules();
    const { default: cfg } = await import("./config.js");
    expect(cfg.telemetry.enabled).toBe(true);
    expect(cfg.telemetry.relayUrl).toBe(
      "https://jjcloud.tail9d0237.ts.net:8787",
    );
    expect(cfg.telemetry.relayTimeoutMs).toBe(3000);
  });
});
