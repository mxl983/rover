import { describe, it, expect } from "vitest";
import { getBatteryPercentage, computePoseOffset } from "./sysUtils.js";

describe("sysUtils", () => {
  describe("getBatteryPercentage", () => {
    it("maps voltage to 0–100 string", () => {
      expect(parseFloat(getBatteryPercentage(9.0))).toBe(0);
      expect(parseFloat(getBatteryPercentage(12.3))).toBe(100);
      const mid = parseFloat(getBatteryPercentage(10.65));
      expect(mid).toBeGreaterThan(40);
      expect(mid).toBeLessThan(60);
    });
  });

  describe("computePoseOffset", () => {
    it("returns null for missing pose", () => {
      expect(computePoseOffset(null)).toBeNull();
    });

    it("computes deltas vs default target", () => {
      const current = { x: 0, y: 0, z: 80, yaw: 0 };
      const o = computePoseOffset(current);
      expect(o).toMatchObject({ x: expect.any(Number), y: expect.any(Number), r: expect.any(Number) });
    });
  });
});
