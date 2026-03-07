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

    const connect = () => {
      socket = new WebSocket(PI_WEBSOCKET);
      socketRef.current = socket;

      socket.onopen = () => setIsOnline(true);

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
        reconnectTimeout = setTimeout(connect, 3000);
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

  return { stats, isOnline, socketRef };
}
