import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const execMock = vi.hoisted(() =>
  vi.fn((cmd, opts, cb) => {
    const callback = typeof opts === "function" ? opts : cb;
    if (callback) callback(null, "", "");
  }),
);

vi.mock("child_process", () => ({
  exec: (...args) => execMock(...args),
}));

vi.mock("axios", () => ({
  default: { patch: vi.fn().mockResolvedValue({ data: {} }) },
}));

vi.mock("../utils/sysUtils.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, speak: vi.fn() };
});

import axios from "axios";
import { createHttpApp } from "../createHttpApp.js";
import config from "../config.js";

describe("/api/camera", () => {
  beforeEach(() => {
    vi.mocked(axios.patch).mockClear();
    execMock.mockClear();
  });

  it("POST nightvision requires boolean", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/camera/nightvision").send({ active: "x" });
    expect(res.status).toBe(400);
  });

  it("POST nightvision patches mediamtx", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/camera/nightvision").send({ active: true });
    expect(res.status).toBe(200);
    expect(axios.patch).toHaveBeenCalledWith(
      config.camera.mediamtxPatchUrl,
      expect.objectContaining({ rpiCameraFPS: 30 }),
    );
  });

  it("POST focus accepts mode", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/camera/focus").send({ mode: "auto" });
    expect(res.status).toBe(200);
    expect(axios.patch).toHaveBeenCalled();
  });

  it("POST resolution defaults to 720p", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/camera/resolution").send({});
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/720p/);
  });

  it("POST settings requires object", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/camera/settings").send({ settings: null });
    expect(res.status).toBe(400);
  });

  it("POST settings applies patch", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/camera/settings")
      .send({ settings: { rpiCameraFPS: 30 } });
    expect(res.status).toBe(200);
    expect(axios.patch).toHaveBeenCalledWith(
      config.camera.mediamtxPatchUrl,
      { rpiCameraFPS: 30 },
    );
  });
});
