import { useEffect, useRef, useState } from "react";
import { PI_WEBSOCKET } from "../config";

const PING_INTERVAL_MS = 3000;
const HEARTBEAT_STALE_MS = 5000;

export function usePiWebSocket() {
  const socketRef = useRef(null);
  const [stats, setStats] = useState({});
  const [isOnline, setIsOnline] = useState(false);
  const lastPingTime = useRef(0);
  const lastHeartBeat = useRef(0);

  useEffect(() => {
    let socket;
    let reconnectTimeout;

    const sendClientInfo = (sock, location = null) => {
      if (!sock || sock.readyState !== WebSocket.OPEN) return;
      const device = {
        userAgent: navigator.userAgent,
        screenWidth: window.screen?.width,
        screenHeight: window.screen?.height,
        platform: navigator.platform,
        language: navigator.language,
      };
      sock.send(
        JSON.stringify({
          type: "CLIENT_INFO",
          device,
          location,
        }),
      );
    };

    const connect = () => {
      socket = new WebSocket(PI_WEBSOCKET);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsOnline(true);
        sendClientInfo(socket);
        if (navigator.geolocation?.getCurrentPosition) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              sendClientInfo(socketRef.current, {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            },
            () => {},
            { timeout: 2000, maximumAge: 60000 },
          );
        }
      };

      socket.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "PONG") {
            lastHeartBeat.current = Date.now();
            setIsOnline(true);
            setStats((prev) => ({
              ...prev,
              latency: Date.now() - lastPingTime.current,
            }));
          } else {
            setStats((prev) => ({ ...prev, ...(data?.data ?? {}) }));
          }
        } catch {
          // ignore parse errors
        }
      };

      socket.onclose = () => {
        setIsOnline(false);
        // Aggressive reconnect so controls become available quickly once Pi is up.
        reconnectTimeout = setTimeout(connect, 1000);
      };

      socket.onerror = () => socket.close();
    };

    connect();

    const pingInterval = setInterval(() => {
      if (document.hidden) return;
      if (socket?.readyState === WebSocket.OPEN) {
        lastPingTime.current = Date.now();
        socket.send(JSON.stringify({ type: "PING" }));
      }
      if (Date.now() - lastHeartBeat.current > HEARTBEAT_STALE_MS) {
        setIsOnline(false);
      }
    }, PING_INTERVAL_MS);

    return () => {
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }, []);

  const sendControl = (payload) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    const msg = Array.isArray(payload)
      ? { type: "DRIVE", payload }
      : { type: "DRIVE", drive: payload.drive, gimbal: payload.gimbal };
    socketRef.current.send(JSON.stringify(msg));
  };

  return { stats, isOnline, socketRef, sendControl };
}
