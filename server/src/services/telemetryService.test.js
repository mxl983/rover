import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("telemetryService", () => {
  const envSnapshot = {};
  const envKeys = [
    "TELEMETRY_ENABLED",
    "TELEMETRY_RELAY_URL",
    "RELAY_API_TOKEN",
  ];

  beforeEach(() => {
    for (const k of envKeys) envSnapshot[k] = process.env[k];
    process.env.TELEMETRY_ENABLED = "true";
    process.env.TELEMETRY_RELAY_URL = "https://relay.test";
    process.env.RELAY_API_TOKEN = "abc123";
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (envSnapshot[k] === undefined) delete process.env[k];
      else process.env[k] = envSnapshot[k];
    }
    vi.unstubAllGlobals();
  });

  it("recordTelemetry relays ingest payload", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { recordTelemetry } = await import("./telemetryService.js");

    recordTelemetry({ battery: 75.2, voltage: 12.1 }, "health_report_scheduled");
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://relay.test/api/telemetry/ingest",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer abc123",
          "Content-Type": "application/json",
        }),
      }),
    );

    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload.event).toBe("health_report_scheduled");
    expect(payload.health.voltage).toBe(12.1);
  });

  it("recordTelemetry preserves high-precision voltage", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { recordTelemetry } = await import("./telemetryService.js");

    recordTelemetry(
      { battery: 75.2, voltage: 12.345678901234, voltageRaw: 123456 },
      "health_report_scheduled",
    );
    await new Promise((r) => setTimeout(r, 0));

    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload.health.voltage).toBe(12.345678901234);
    expect(payload.health.voltageRaw).toBe(123456);
  });

  it("getTelemetry returns relay telemetry array", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ telemetry: [{ id: 1, event: "ok" }] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getTelemetry } = await import("./telemetryService.js");

    const rows = await getTelemetry({ limit: 5 });
    expect(rows).toEqual([{ id: 1, event: "ok" }]);
  });

  it("recordClientConnection relays client payload", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { recordClientConnection } = await import("./telemetryService.js");

    recordClientConnection({ event: "connect", clientIp: "127.0.0.1" });
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://relay.test/api/telemetry/client-connection",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("recordRoverHeartbeat relays heartbeat payload", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { recordRoverHeartbeat } = await import("./telemetryService.js");

    recordRoverHeartbeat({
      phase: "booting",
      bootStartedAt: "2026-01-01T00:00:00.000Z",
      health: { battery: 91.1, videoOn: true },
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://relay.test/api/rover/heartbeat",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
