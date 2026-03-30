import { describe, it, expect, vi } from "vitest";
import { WebSocket } from "ws";
import { broadcastJsonToClients } from "./wsBroadcast.js";

describe("broadcastJsonToClients", () => {
  it("sends JSON only to OPEN clients", () => {
    const openSend = vi.fn();
    const closedSend = vi.fn();
    const wss = {
      clients: new Set([
        { readyState: WebSocket.OPEN, send: openSend },
        { readyState: WebSocket.CLOSED, send: closedSend },
      ]),
    };
    broadcastJsonToClients(wss, { type: "X", n: 1 });
    expect(openSend).toHaveBeenCalledWith(JSON.stringify({ type: "X", n: 1 }));
    expect(closedSend).not.toHaveBeenCalled();
  });
});
