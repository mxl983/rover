import { useEffect, useRef, useState } from "react";
import { VideoStream } from "./components/VideoStream";
import { SubsystemItem } from "./components/SubSystemItem";
import { Meters } from "./components/Meters";
import { ControlCluster } from "./components/ControlCluster";

const PI_HOST = "rover.tail9d0237.ts.net";
const CAMERA_URL = "http://rover.tail9d0237.ts.net:8889/cam/";

export default function App() {
  const socketRef = useRef(null);

  const [latency, setLatency] = useState(0);
  const [pan, setPan] = useState(0);
  const [stats, setStats] = useState({});

  const [piOnline, setPiOnline] = useState(false);

  const PAN_STEP = 5;
  const MAX_PAN = 90;
  let pingStart = useRef(0);

  /* Ping Loop */
  useEffect(() => {
    const socket = new WebSocket(`ws://${PI_HOST}:3000`);
    socketRef.current = socket;

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      switch (data.type) {
        // Heart Beat
        case "PONG":
          let heartBeatGap = Date.now() - pingStart.current;
          pingStart.current = Date.now();
          setPiOnline(heartBeatGap < 5000);
          setStats((prev) => ({
            ...prev,
            latency: Date.now() - pingStart.current,
          }));
          break;
        default:
          setStats((prev) => ({
            ...prev,
            ...(data?.data || {}),
          }));
          break;
      }
    };

    const pingCheckFn = () => {
      socket.send(JSON.stringify({ type: "PING" }));
    };

    // pingCheckFn();
    const pingInterval = setInterval(pingCheckFn, 3000);

    return () => {
      clearInterval(pingInterval);
      socket.close();
    };
  }, []);

  /* Drive */
  const handleDriveUpdate = async (keysArray) => {
    try {
      const response = await fetch(`http://${PI_HOST}:3000/api/control/drive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // We send the array of currently active keys
        body: JSON.stringify({ keys: keysArray }),
      });

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
            CAM_01 // {new Date().toLocaleTimeString()}
          </div>
        </div>

        <div className="hud-left">
          <div className="glass-card-metrics">
            <div className="card-title">SUBSYSTEM_CHECK</div>
            <SubsystemItem
              label="PI_SERVER"
              dotColor={piOnline ? "green" : "red"}
            />
          </div>
        </div>

        <div className="hud-footer">
          <div className="drive-control-monitor glass-card">
            <Meters stats={stats} />
          </div>

          <ControlCluster onDrive={handleDriveUpdate} />
        </div>
      </div>
    </div>
  );
}
