import { WebSocket } from "ws";

export function broadcastJsonToClients(wss, payload) {
  const text = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  });
}
