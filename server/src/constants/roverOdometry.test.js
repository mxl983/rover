import { describe, it, expect } from "vitest";
import {
  ROVER_ODOMETRY,
  MM_PER_ENCODER_TICK,
  getOdometryCalibrationSnapshot,
} from "./roverOdometry.js";

describe("roverOdometry", () => {
  it("exports consistent model", () => {
    expect(ROVER_ODOMETRY.referenceMotor).toBe("M1");
    expect(ROVER_ODOMETRY.wheelDiameterMm).toBeGreaterThan(0);
    expect(MM_PER_ENCODER_TICK).toBeGreaterThan(0);
  });

  it("getOdometryCalibrationSnapshot includes distance", () => {
    const snap = getOdometryCalibrationSnapshot(123);
    expect(snap.cumulativePathMm).toBe(123);
    expect(snap.referenceMotor).toBe(ROVER_ODOMETRY.referenceMotor);
  });
});
