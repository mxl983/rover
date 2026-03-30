import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../services/driverService.js", () => ({
  driverService: { sendMoveCommand: vi.fn() },
}));

import { createHttpApp } from "../createHttpApp.js";
import { driverService } from "../services/driverService.js";
import { stateService } from "../services/stateService.js";
import { isValidDrivePayload } from "./control.js";

describe("isValidDrivePayload", () => {
  it("accepts key array", () => {
    expect(isValidDrivePayload(["w"])).toBe(true);
  });

  it("accepts drive/gimbal object", () => {
    expect(isValidDrivePayload({ drive: { x: 0, y: 0 } })).toBe(true);
    expect(isValidDrivePayload({ gimbal: { x: 0, y: 0 } })).toBe(true);
  });

  it("accepts command shortcuts", () => {
    expect(isValidDrivePayload({ command: "look_down" })).toBe(true);
    expect(isValidDrivePayload({ command: "toggle_laser" })).toBe(true);
  });

  it("rejects bad drive type", () => {
    expect(isValidDrivePayload({ drive: "x" })).toBe(false);
  });
});

describe("POST /api/control", () => {
  beforeEach(() => {
    vi.mocked(driverService.sendMoveCommand).mockClear();
  });

  it("accepts valid drive body", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/control/drive")
      .send({ drive: { x: 0, y: -0.5 } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(driverService.sendMoveCommand).toHaveBeenCalled();
  });

  it("400 on invalid body", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/control/drive").send({ drive: "bad" });
    expect(res.status).toBe(400);
  });

  it("docking clears docking mode flag", async () => {
    stateService.isDockingMode = true;
    const app = createHttpApp();
    const res = await request(app).post("/api/control/docking").send({});
    expect(res.status).toBe(200);
    expect(stateService.isDockingMode).toBe(false);
  });
});
