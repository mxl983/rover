import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/sysUtils.js", () => ({
  getCpuTemp: vi.fn(() => "42.0"),
  getWifiSignal: vi.fn(() => -48),
  getCpuLoad: vi.fn(() => 25),
  getBatteryPercentage: vi.fn(() => "55.0"),
}));

vi.mock("../constants/roverOdometry.js", () => ({
  getOdometryCalibrationSnapshot: vi.fn(() => ({ testOdom: true })),
}));

import { stateService } from "./stateService.js";

describe("stateService", () => {
  beforeEach(() => {
    stateService.quietMode = false;
    stateService.usbPowerState = true;
    stateService.currentVoltage = 11;
    stateService.batteryPctSamples = [];
    stateService.startupTime = Date.now() - 120_000;
  });

  it("quietMode toggles", () => {
    stateService.quietMode = true;
    expect(stateService.quietMode).toBe(true);
  });

  it("getHealth returns structured object when sysUtils work", () => {
    const h = stateService.getHealth();
    expect(h).toMatchObject({
      battery: "55.0",
      voltage: 11,
      usbPower: "on",
      quietMode: false,
    });
    expect(h.odometry).toEqual({ testOdom: true });
  });
});
