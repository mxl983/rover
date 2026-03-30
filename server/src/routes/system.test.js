import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { writeFileSyncMock } = vi.hoisted(() => ({
  writeFileSyncMock: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal();
  const ns = {
    ...actual,
    writeFileSync: writeFileSyncMock,
  };
  return { ...ns, default: ns };
});

vi.mock("../utils/sysUtils.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    speak: vi.fn(),
  };
});

vi.mock("../services/telemetryService.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    recordTelemetry: vi.fn(),
  };
});

import { createHttpApp } from "../createHttpApp.js";
import { stateService } from "../services/stateService.js";

describe("/api/system", () => {
  beforeEach(() => {
    writeFileSyncMock.mockClear();
    stateService.quietMode = true;
  });

  it("GET quiet-mode", async () => {
    stateService.quietMode = false;
    const app = createHttpApp();
    const res = await request(app).get("/api/system/quiet-mode");
    expect(res.status).toBe(200);
    expect(res.body.quietMode).toBe(false);
  });

  it("POST quiet-mode validates boolean", async () => {
    const app = createHttpApp();
    const bad = await request(app).post("/api/system/quiet-mode").send({ enabled: "yes" });
    expect(bad.status).toBe(400);
    const ok = await request(app).post("/api/system/quiet-mode").send({ enabled: true });
    expect(ok.status).toBe(200);
    expect(ok.body.quietMode).toBe(true);
  });

  it("POST shutdown writes file", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/system/shutdown").send({});
    expect(res.status).toBe(200);
    expect(writeFileSyncMock).toHaveBeenCalled();
  });

  it("POST reboot writes file", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/system/reboot").send({});
    expect(res.status).toBe(200);
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/app/shared/reboot.req",
      "rebooting",
    );
  });
});
