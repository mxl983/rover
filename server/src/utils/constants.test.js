import { describe, it, expect } from "vitest";
import { targetPoseRecord } from "./constants.js";

describe("utils/constants", () => {
  it("targetPoseRecord has expected keys", () => {
    expect(targetPoseRecord).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number),
      yaw: expect.any(Number),
    });
  });
});
