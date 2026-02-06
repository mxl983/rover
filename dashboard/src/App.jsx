import { useEffect, useRef, useState } from "react";
import { VideoStream } from "./components/VideoStream";
import { SubsystemItem } from "./components/SubSystemItem";
import { Meters } from "./components/Meters";
import { ControlCluster } from "./components/ControlCluster";
import { CaptureButton } from "./components/CaptureButton";

const PI_HOST = "rover.tail9d0237.ts.net";

export default function App() {
  const socketRef = useRef(null);
  const [stats, setStats] = useState({});
  const [piOnline, setPiOnline] = useState(false);

  let lastPingTime = useRef(0);
  let lastHeartBeat = useRef(0);

  useEffect(() => {
    let socket;
    let reconnectTimeout;

    const connect = () => {
      console.log("🛰️ Attempting WebSocket uplink...");
      socket = new WebSocket(`wss://${PI_HOST}:3000`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("✅ Uplink established");
        setPiOnline(true);
      };

      socket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "PONG") {
          lastHeartBeat.current = Date.now();
          setPiOnline(true);
          setStats((prev) => ({
            ...prev,
            latency: Date.now() - lastPingTime.current,
          }));
        } else {
          setStats((prev) => ({ ...prev, ...(data?.data || {}) }));
        }
      };

      socket.onclose = () => {
        console.warn("❌ Uplink severed. Retrying in 3s...");
        setPiOnline(false);
        reconnectTimeout = setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error("Socket Error:", err);
        socket.close();
      };
    };

    connect();

    const pingInterval = setInterval(() => {
      // Only ping if the socket is actually open
      if (socket && socket.readyState === WebSocket.OPEN) {
        lastPingTime.current = Date.now();
        socket.send(JSON.stringify({ type: "PING" }));
      }

      // Secondary safety: check heartbeat gap
      if (Date.now() - lastHeartBeat.current > 5000) {
        setPiOnline(false);
      }
    }, 3000);

    return () => {
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeout);
      socket.close();
    };
  }, []);

  const handleDriveUpdate = async (keysArray) => {
    try {
      const response = await fetch(
        `https://${PI_HOST}:3000/api/control/drive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keys: keysArray }),
        },
      );

      if (!response.ok) {
        console.warn("Server responded with an error");
      }
    } catch (error) {
      console.error("Network error sending drive command:", error);
    }
  };

  return (
    <div className="viewport">
      <VideoStream />

      <div className="hud-overlay">
        <div className="hud-header">
          <div className="glass-card">Mango Rover V1.0</div>
          <div className="glass-card">
            IMX708 // {new Date().toLocaleTimeString()}
          </div>
        </div>

        <div className="hud-footer">
          <div className="drive-control-monitor glass-card">
            {/* <div className="card-title">SUBSYSTEM_CHECK</div> */}
            <SubsystemItem
              label="PI_SERVER"
              dotColor={piOnline ? "green" : "red"}
            />
            <Meters stats={stats} />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "20px",
            }}
          >
            <ControlCluster onDrive={handleDriveUpdate} />
            <CaptureButton></CaptureButton>
          </div>
        </div>
      </div>
    </div>
  );
}
