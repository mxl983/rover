import { useEffect, useRef, useState } from "react";
import { VideoStream } from "./components/VideoStream";
import { SubsystemItem } from "./components/SubSystemItem";
import { Meters } from "./components/Meters";
import { ControlCluster } from "./components/ControlCluster";
import {
  PI_CONTROL_ENDPOINT,
  PI_WEBSOCKET,
  MQTT_HOST,
  PI_SYSTEM_ENDPOINT,
  PI_CAMERA_ENDPOINT,
  PI_DOCKING_ENDPOINT,
  PI_HI_RES_CAPTURE_ENDPOINT,
} from "./constants";
import { LoginOverlay } from "./components/LoginOverlay";
import mqtt from "mqtt";
import { SystemControls } from "./components/SystemControls";
import { WifiSignal } from "./components/WifiSignal";
import { DriveAssistHUD } from "./components/DriveAssistHUD";
import { ChevronLeft } from "lucide-react";
import { RoverSchematic } from "./components/RoverSchematic";
import { FullscreenButton } from "./components/FullscreenButton";
import { DualJoystickControls } from "./components/JoystickControlCluster";
import { useIsMobile } from "./hooks/useIsMobile";

export default function App() {
  const socketRef = useRef(null);
  const [stats, setStats] = useState({});
  const [piOnline, setPiOnline] = useState(false);
  const [espOnline, setEspOnline] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionCreds, setSessionCreds] = useState(null);
  const [isPowered, setIsPowered] = useState(true);
  const [nvActive, setNvActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [resMode, setResMode] = useState("720p");
  const [focusMode, setFocusMode] = useState("far");
  const [compact, setCompact] = useState(true);
  const isMobile = useIsMobile();

  let lastPingTime = useRef(0);
  let lastHeartBeat = useRef(0);

  const mqttClientRef = useRef(null);

  useEffect(() => {
    setIsPowered(piOnline);
  }, [piOnline]);

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

    client.subscribe("rover/esp/heartbeat", (err) => {
      if (!err) {
        console.log("📥 Subscribed to ESP32 Heartbeat");
      }
    });

    client.on("message", (topic) => {
      if (topic === "rover/esp/heartbeat") {
        setEspOnline(true);
      }
    });

    return () => {
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
      if (document.hidden) {
        // Tab is minified or inactive.
        // We do NOTHING, so the server doesn't get a PING.
        console.log("Tab hidden: PING suspended.");
        return;
      }

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
        body: JSON.stringify(keysArray),
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

  const handleSystemAction = async (type) => {
    if (type === "boot") {
      // Logic for ESP32 to turn relay back on
      mqttClientRef.current?.publish("rover/power/pi", "On", {
        qos: 1,
      });
      mqttClientRef.current?.publish("rover/power/aux", "On", {
        qos: 1,
      });
      setIsPowered(true);
      return;
    }

    const confirm = window.confirm(`Confirm ${type}?`);
    if (!confirm) return;

    try {
      // Use the logic we built: Shutdown uses /shutdown, Reboot uses /reboot
      const endpoint = `${PI_SYSTEM_ENDPOINT}/${type}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        if (type === "shutdown") {
          // Tell ESP32 to kill power after the OS has time to park (15s)
          mqttClientRef.current?.publish("rover/power/pi", "Off 15000", {
            qos: 1,
          });
          setIsPowered(false);
        }
        // If rebooting, we just wait for the ping to come back
      }
    } catch (err) {
      console.error("System action failed", err);
    }
  };

  const handleNVToggle = async (requestedState) => {
    try {
      const res = await fetch(`${PI_CAMERA_ENDPOINT}/nightvision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: requestedState,
          secret: "rover-alpha-99",
        }),
      });

      if (res.ok) {
        setNvActive(requestedState);
        console.log(`Night Vision ${requestedState ? "ON" : "OFF"}`);
      }
    } catch (err) {
      console.error("Failed to toggle Night Vision:", err);
    }
  };

  const handleResChange = async (newMode) => {
    // Same fetch logic as before, just sending 'newMode' (e.g., '1080p')
    const res = await fetch(`${PI_CAMERA_ENDPOINT}/resolution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode, secret: "rover-alpha-99" }),
    });
    if (res.ok) setResMode(newMode);
  };

  const handleFocusChange = async (newMode) => {
    const res = await fetch(`${PI_CAMERA_ENDPOINT}/focus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode, secret: "rover-alpha-99" }),
    });
    if (res.ok) setFocusMode(newMode);
  };

  const toggleLight = async (state) => {
    const res = await fetch(`${PI_SYSTEM_ENDPOINT}/usb-power`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: state }),
    });
    if (!res.ok) console.error("Failed to toggle light");
  };

  const toggleDocking = async (isEnable) => {
    await fetch(PI_DOCKING_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: isEnable }),
    });
  };

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const res = await fetch(PI_HI_RES_CAPTURE_ENDPOINT, { method: "POST" });
      const data = await res.json();
      window.open(data.url, "_blank");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCameraReset = async () => {
    console.log("Resetting gimbal to 90/90 center...");
    const payload = { command: "reset_servos" };
    try {
      const response = await fetch(PI_CONTROL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
      {!isAuthenticated && <LoginOverlay onLoginSuccess={handleLoginSuccess} />}
      <VideoStream dockingData={stats.docking} />
      <DriveAssistHUD pan={stats.pan} tilt={stats.tilt} />

      {isAuthenticated && (
        <div className="hud-overlay">
          <div className="hud-header">
            <div
              className="glass-card"
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "10px",
                padding: "5px",
                border: "none",
              }}
            >
              <div>Mango Rover V1.0</div>{" "}
              {stats?.wifiSignal && (
                <WifiSignal dbm={stats.wifiSignal}></WifiSignal>
              )}
            </div>
            <div
              className="glass-card"
              style={{
                display: "flex",
                flexDirection: "row",
                gap: "20px",
                border: "none",
                padding: "0px",
              }}
            >
              <SystemControls
                isPowered={isPowered}
                nvActive={nvActive}
                resMode={resMode}
                onNVToggle={handleNVToggle}
                onResChange={handleResChange}
                onAction={handleSystemAction}
                focusMode={focusMode}
                onFocusChange={handleFocusChange}
              />
              <FullscreenButton></FullscreenButton>
            </div>
          </div>

          <div className="hud-footer">
            {compact && (
              <RoverSchematic
                pan={stats.pan}
                battery={stats.battery}
                isOffline={!piOnline}
                handleClick={() => {
                  console.log(123);
                  setCompact(false);
                }}
              />
            )}
            {!compact && (
              <div
                className="drive-control-monitor glass-card"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  paddingRight: "0px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <SubsystemItem
                    label="PI_SERVER"
                    dotColor={piOnline ? "green" : "red"}
                  />
                  <SubsystemItem
                    label="ESP32"
                    dotColor={espOnline ? "green" : "red"}
                  />
                  <Meters stats={stats} compact={compact} />
                </div>
                <ChevronLeft onClick={() => setCompact(true)} />
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "20px",
              }}
            >
              {piOnline ? (
                <>
                  {!isMobile && (
                    <ControlCluster
                      onDockingToggle={toggleDocking}
                      onDrive={handleDriveUpdate}
                      usbPower={stats.usbPower}
                      onLightToggle={() => {
                        const nextState =
                          stats.usbPower === "on" ? "off" : "on";
                        toggleLight(nextState);
                      }}
                      isDockingMode={stats.isDockingMode}
                      onCapture={handleCapture}
                      isCapturing={isCapturing}
                      onReset={handleCameraReset}
                    />
                  )}
                  {isMobile && (
                    <DualJoystickControls
                      onDrive={handleDriveUpdate}
                      onReset={handleCameraReset}
                    />
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
