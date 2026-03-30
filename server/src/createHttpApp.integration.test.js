import { describe, it, expect } from "vitest";
import request from "supertest";
import { createHttpApp } from "./createHttpApp.js";

describe("createHttpApp integration", () => {
  it("GET /healthz", async () => {
    const app = createHttpApp({ getTelemetry: () => [] });
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("ok");
  });

  it("GET /api/telemetry uses injected reader", async () => {
    const app = createHttpApp({ getTelemetry: () => [{ id: 1 }] });
    const res = await request(app).get("/api/telemetry");
    expect(res.status).toBe(200);
    expect(res.body.telemetry).toEqual([{ id: 1 }]);
  });

  it("404 unknown path", async () => {
    const app = createHttpApp({ getTelemetry: () => [] });
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
  });
});
