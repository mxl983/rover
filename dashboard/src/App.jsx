import { useEffect, useRef, useState } from "react";
import { VideoStream } from "./components/VideoStream";
import { SubsystemItem } from "./components/SubSystemItem";
import { Meters } from "./components/Meters";
import { ControlCluster } from "./components/ControlCluster";

const PI_IP = "rover.tail9d0237.ts.net";

export default function App() {
  const socketRef = useRef(null);

  const [latency, setLatency] = useState(0);
  const [pan, setPan] = useState(0);
  const [stats, setStats] = useState({});

  const PAN_STEP = 5;
  const MAX_PAN = 90;
  let pingStart = useRef(0);

  /* WebSocket */
  useEffect(() => {
    const socket = new WebSocket(`ws://${PI_IP}:3000`);
    socketRef.current = socket;

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "PONG") {
        setStats((prev) => ({
          ...prev,
          latency: Date.now() - pingStart.current,
        }));
      } else {
        setStats((prev) => ({
          ...prev,
          ...(data?.data || {}),
        }));
      }
    };

    const pingInterval = setInterval(() => {
      pingStart.current = Date.now();
      socket.send(JSON.stringify({ type: "PING" }));
    }, 3000);

    return () => {
      clearInterval(pingInterval);
      socket.close();
    };
  }, []);

  /* Drive */
  const drive = (dir) => {
    fetch(`http://${PI_IP}:3000/api/control/${dir}`, { method: "POST" });

    if (dir === "left") setPan((p) => Math.max(p - PAN_STEP, -MAX_PAN));
    if (dir === "right") setPan((p) => Math.min(p + PAN_STEP, MAX_PAN));
  };

  const stop = () =>
    fetch(`http://${PI_IP}:3000/api/control/stop`, { method: "POST" });

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
              label="CAM_UNIT"
              status={stats?.camera?.status}
              dotColor={stats?.camera?.dot}
              statusColor={stats?.camera?.color}
            />

            <SubsystemItem
              label="DRIVE_SYS"
              status={stats?.motors?.status}
              dotColor={stats?.motors?.dot}
              statusColor={stats?.motors?.color}
            />

            <SubsystemItem
              label="ESP_LINK"
              status={stats?.esp32?.status}
              dotColor={stats?.esp32?.dot}
              statusColor={stats?.esp32?.color}
            />
          </div>
        </div>

        <div className="hud-footer">
          <div className="drive-control-monitor glass-card">
            <Meters stats={stats} />
          </div>

          <ControlCluster />
        </div>

        {/* <div id="cameraGroup" style={{ transform: `rotate(${pan}deg)` }} /> */}
      </div>
    </div>
  );
}
