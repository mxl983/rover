import { useEffect, useRef, useState } from "react";
import { VideoStream } from "./components/VideoStream";
import { SubsystemItem } from "./components/SubSystemItem";
import { Meters } from "./components/Meters";
import { ControlCluster } from "./components/ControlCluster";
import { CaptureButton } from "./components/CaptureButton";
import { PI_CONTROL_ENDPOINT, PI_WEBSOCKET, MQTT_HOST } from "./constants";
import { LoginOverlay } from "./components/LoginOverlay";
import mqtt from "mqtt";

const styles = {
  powerBtn: {
    width: "auto",
    display: "inline-block",
    border: "none",
    padding: "12px 24px",
    color: "#000",
    fontWeight: "bold",
    cursor: "pointer",
    fontFamily: "monospace",
    transition: "all 0.3s ease",
  },
  status: { color: "#666", fontSize: "9px", marginTop: "10px" },
};

export default function App() {
  const socketRef = useRef(null);
  const [stats, setStats] = useState({});
  const [piOnline, setPiOnline] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionCreds, setSessionCreds] = useState(null);
  const [isPowered, setIsPowered] = useState(true);

  let lastPingTime = useRef(0);
  let lastHeartBeat = useRef(0);

  const mqttClientRef = useRef(null);

  // WS connection with MQTT
  useEffect(() => {
    if (!sessionCreds) return;
    // 1. Connect to HiveMQ
    const client = mqtt.connect(MQTT_HOST, {
      username: sessionCreds.username,
      password: sessionCreds.password,
      clientId: `heartbeat_web_${Math.random().toString(16).substring(2, 5)}`,
    });

    mqttClientRef.current = client;

    // 2. Set up the Heartbeat Interval (Every 30 seconds)
    const heartbeatInterval = setInterval(() => {
      if (client.connected) {
        console.log("💓 Sending Heartbeat...");
        // We send a simple timestamp or "1" to the heartbeat topic
        client.publish("rover/heartbeat", String(Date.now()), {
          qos: 1,
          retain: true,
        });
      }
    }, 30000);

    return () => {
      clearInterval(heartbeatInterval);
      client.end();
    };
  }, [sessionCreds]);

  // WS connection with PI
  useEffect(() => {
    let socket;
    let reconnectTimeout;

    const connect = () => {
      console.log("🛰️ Attempting WebSocket uplink...");
      socket = new WebSocket(PI_WEBSOCKET);
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

  // Drive commands
  const handleDriveUpdate = async (keysArray) => {
    try {
      const response = await fetch(PI_CONTROL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keys: keysArray }),
      });

      if (!response.ok) {
        console.warn("Server responded with an error");
      }
    } catch (error) {
      console.error("Network error sending drive command:", error);
    }
  };

  const handleLoginSuccess = (client, creds) => {
    console.log("Access Granted. Initializing HUD...");

    // 1. Store the credentials for your MQTT controller to use
    setSessionCreds(creds);

    // 2. Flip the switch to hide the login and show the rover UI
    setIsAuthenticated(true);
  };

  const handlePowerToggle = () => {
    const nextState = !isPowered;
    const command = nextState ? "On" : "Off";

    const options = { qos: 1, retain: true };

    if (mqttClientRef.current) {
      console.log(`📡 Sending Power Command: ${command}`);
      mqttClientRef.current.publish("rover/power/pi", command, options);
      mqttClientRef.current.publish("rover/power/aux", command, options);
      setIsPowered(nextState);
    }
  };

  return (
    <div className="viewport">
      {!isAuthenticated && <LoginOverlay onLoginSuccess={handleLoginSuccess} />}
      <VideoStream />

      {isAuthenticated && (
        <div className="hud-overlay">
          <div className="hud-header">
            <div className="glass-card">Mango Rover V1.0</div>
            <div
              className="glass-card"
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <div>IMX708 // {new Date().toLocaleTimeString()}</div>
              {
                <button
                  onClick={handlePowerToggle}
                  style={{
                    ...styles.powerBtn,
                    backgroundColor: isPowered ? "#ff4444" : "#00f2ff",
                    boxShadow: isPowered
                      ? "0 0 15px #ff444466"
                      : "0 0 15px #00f2ff66",
                  }}
                >
                  {isPowered ? "SHUTDOWN_ROVER" : "BOOT_ROVER"}
                </button>
              }
            </div>
          </div>

          <div className="hud-footer">
            <div className="drive-control-monitor glass-card">
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
      )}
    </div>
  );
}
