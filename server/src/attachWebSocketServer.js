import { WebSocketServer } from "ws";
import { isValidDrivePayload } from "./routes/control.js";
import { driverService } from "./services/driverService.js";
import { stateService } from "./services/stateService.js";
import { speak } from "./utils/sysUtils.js";
import { recordClientConnection } from "./services/telemetryService.js";
import { logger } from "./utils/logger.js";
import { getPlatformHint } from "./utils/userAgentPlatform.js";

/**
 * Attach WebSocket control channel to an existing HTTP(S) server.
 * @param {import("http").Server} httpServer
 * @returns {import("ws").WebSocketServer}
 */
export function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws, request) => {
    const clientIp =
      request.socket?.remoteAddress ??
      request.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ??
      null;
    const userAgent = request.headers?.["user-agent"] ?? null;
    logger.info(
      { clientIp, userAgent: userAgent?.slice(0, 60) },
      "New browser client connected",
    );
    recordClientConnection({
      event: "connect",
      clientIp,
      userAgent,
    });
    const platform = getPlatformHint(userAgent);
    const text = platform ? `控制面板已连接，设备是${platform}。` : "控制面板已连接。";
    speak(text, { language: "zh" });

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message);

        if (data.type === "PING") {
          stateService.lastPingTimestamp = Date.now();
          ws.send(JSON.stringify({ type: "PONG" }));
          return;
        }
        if (data.type === "DRIVE") {
          const payload =
            data.payload !== undefined ? data.payload : { drive: data.drive, gimbal: data.gimbal };
          if (isValidDrivePayload(payload)) {
            const quiet = stateService.quietMode;
            const cmd = Array.isArray(payload)
              ? { keys: payload, quietMode: quiet }
              : { ...payload, quietMode: quiet };
            driverService.sendMoveCommand(cmd);
          }
          return;
        }
        if (data.type === "CLIENT_INFO") {
          const ip =
            request.socket?.remoteAddress ??
            request.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ??
            null;
          recordClientConnection({
            event: "client_info",
            clientIp: ip,
            userAgent: request.headers?.["user-agent"] ?? null,
            deviceInfo: data.device ?? null,
            locationInfo: data.location ?? null,
          });
          logger.info(
            { device: data.device, location: data.location },
            "Client device/location info received",
          );
          return;
        }
      } catch (err) {
        logger.warn(
          { err, raw: message.toString() },
          "Invalid JSON received from WebSocket client",
        );
      }
    });

    ws.on("close", () => {
      logger.info("Client disconnected");
      recordClientConnection({
        event: "disconnect",
        clientIp: request.socket?.remoteAddress ?? null,
        userAgent: request.headers?.["user-agent"] ?? null,
      });
    });
  });

  return wss;
}
