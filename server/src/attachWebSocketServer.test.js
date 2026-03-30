import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "http";
import WebSocket from "ws";

vi.mock("./utils/sysUtils.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, speak: vi.fn() };
});

vi.mock("./services/telemetryService.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, recordClientConnection: vi.fn() };
});

vi.mock("./services/driverService.js", () => ({
  driverService: { sendMoveCommand: vi.fn() },
}));

import { attachWebSocketServer } from "./attachWebSocketServer.js";
import { driverService } from "./services/driverService.js";

describe("attachWebSocketServer", () => {
  let server;
  let wss;

  beforeEach(() => {
    vi.mocked(driverService.sendMoveCommand).mockClear();
  });

  async function listen() {
    server = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    wss = attachWebSocketServer(server);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return server.address().port;
  }

  async function closeAll() {
    await new Promise((r) => server.close(r));
  }

  it("PING returns PONG", async () => {
    const port = await listen();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    const msg = await new Promise((resolve) => {
      ws.on("message", (d) => resolve(JSON.parse(d.toString())));
      ws.send(JSON.stringify({ type: "PING" }));
    });
    expect(msg.type).toBe("PONG");
    ws.close();
    await closeAll();
  });

  it("DRIVE with valid payload calls driver", async () => {
    const port = await listen();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    ws.send(JSON.stringify({ type: "DRIVE", payload: { drive: { x: 0, y: -0.5 } } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(driverService.sendMoveCommand).toHaveBeenCalled();
    ws.close();
    await closeAll();
  });

  it("invalid JSON does not throw", async () => {
    const port = await listen();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    ws.send("not-json{{{");
    await new Promise((r) => setTimeout(r, 30));
    ws.close();
    await closeAll();
  });
});
