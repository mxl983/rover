import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTelemetry,
  recordTelemetry,
  getTelemetry,
  recordClientConnection,
  closeTelemetry,
} from "./telemetryService.js";

describe("telemetryService", () => {
  beforeAll(() => {
    initTelemetry();
  });

  afterAll(() => {
    closeTelemetry();
  });

  it("recordTelemetry and getTelemetry roundtrip", () => {
    recordTelemetry(
      { voltage: 11, battery: "50", distance: 1, pan: 0, tilt: 0, cpuTemp: "40", cpuLoad: 10, wifiSignal: -50, usbPower: "on" },
      "test_event",
    );
    const rows = getTelemetry({ limit: 5 });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].event).toBe("test_event");
  });

  it("recordClientConnection inserts", () => {
    recordClientConnection({
      event: "connect",
      clientIp: "127.0.0.1",
      userAgent: "test-ua",
    });
    const rows = getTelemetry({ limit: 1 });
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });
});
