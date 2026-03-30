import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { success, error, notFound, badRequest, asyncHandler } from "./apiResponse.js";

describe("apiResponse", () => {
  it("success merges object data", async () => {
    const app = express();
    app.get("/t", (req, res) => success(res, { a: 1 }));
    const res = await request(app).get("/t");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, a: 1 });
  });

  it("success with null uses bare success", async () => {
    const app = express();
    app.get("/t", (req, res) => success(res, null));
    const res = await request(app).get("/t");
    expect(res.body).toEqual({ success: true });
  });

  it("error sets message and status", async () => {
    const app = express();
    app.get("/t", (req, res) => error(res, "nope", 418));
    const res = await request(app).get("/t");
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ success: false, error: "nope" });
  });

  it("notFound and badRequest", async () => {
    const app = express();
    app.get("/a", (req, res) => notFound(res));
    app.get("/b", (req, res) => badRequest(res, "bad"));
    expect((await request(app).get("/a")).status).toBe(404);
    expect((await request(app).get("/b")).status).toBe(400);
  });

  it("asyncHandler forwards to next on rejection", async () => {
    const app = express();
    app.get(
      "/t",
      asyncHandler(async () => {
        throw new Error("boom");
      }),
    );
    app.use((err, req, res, next) => {
      res.status(500).json({ err: err.message });
    });
    const res = await request(app).get("/t");
    expect(res.status).toBe(500);
    expect(res.body.err).toBe("boom");
  });
});
