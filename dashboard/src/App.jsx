import { useEffect, useState } from "react";
import { VideoStream } from "./components/VideoStream";
import { SubsystemItem } from "./components/SubSystemItem";
import { Meters } from "./components/Meters";
import { ControlCluster } from "./components/ControlCluster";
import {
  PI_CONTROL_ENDPOINT,
  PI_SYSTEM_ENDPOINT,
  PI_CAMERA_ENDPOINT,
  PI_DOCKING_ENDPOINT,
  PI_HI_RES_CAPTURE_ENDPOINT,
  CAMERA_SECRET,
} from "./config";
import { LoginOverlay } from "./components/LoginOverlay";
import { SystemControls } from "./components/SystemControls";
import { WifiSignal } from "./components/WifiSignal";
import { DriveAssistHUD } from "./components/DriveAssistHUD";
import { ChevronLeft, LogOut } from "lucide-react";
import { RoverSchematic } from "./components/RoverSchematic";
import { FullscreenButton } from "./components/FullscreenButton";
import { DualJoystickControls } from "./components/JoystickControlCluster";
import { useIsMobile } from "./hooks/useIsMobile";
import { usePiWebSocket } from "./hooks/usePiWebSocket";
import { useMqtt } from "./hooks/useMqtt";
import { useRoverSession } from "./context/RoverSessionContext";
import { apiPostJson, apiPost } from "./api/client";
import { isAllowedCaptureUrl } from "./api/capture";

export default function App() {
  const { isAuthenticated, sessionCreds, login, logout } = useRoverSession();
  const { stats, isOnline: piOnline } = usePiWebSocket();
  const { isEspOnline, mqttClientRef } = useMqtt(isAuthenticated ? sessionCreds : null);

  const [isPowered, setIsPowered] = useState(true);
  const [nvActive, setNvActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [resMode, setResMode] = useState("720p");
  const [focusMode, setFocusMode] = useState("far");
  const [compact, setCompact] = useState(true);
  const [actionError, setActionError] = useState(null);
  const [, setSystemLoading] = useState(false);
  const [, setCameraLoading] = useState(false);

  const isMobile = useIsMobile();

  useEffect(() => {
    setIsPowered(piOnline);
  }, [piOnline]);

  const clearError = () => setActionError(null);

  const handleDriveUpdate = async (keysArray) => {
    setActionError(null);
    try {
      await apiPostJson(PI_CONTROL_ENDPOINT, keysArray);
    } catch (err) {
      setActionError(err.message ?? "Drive command failed");
    }
  };

  const handleLoginSuccess = (_client, creds) => {
    setActionError(null);
    login(creds);
  };

  const handleSystemAction = async (type) => {
    // 1. Intercept Boot
    if (type === "boot") {
      mqttClientRef.current?.publish("rover/power/pi", "On", { qos: 1 });
      mqttClientRef.current?.publish("rover/power/aux", "On", { qos: 1 });
      setIsPowered(true);
      return;
    }
  
    // 2. Intercept Capture (New)
    if (type === "capture") {
      await handleCapture(); // Divert to your specific capture logic
      return;
    }
  
    // 3. Handle generic system commands (Reboot/Shutdown)
    if (!window.confirm(`Confirm ${type}?`)) return;
  
    setSystemLoading(true);
    setActionError(null);
    try {
      const endpoint = `${PI_SYSTEM_ENDPOINT}/${type}`;
      await apiPostJson(endpoint, {});
  
      if (type === "shutdown") {
        mqttClientRef.current?.publish("rover/power/pi", "Off 15000", { qos: 1 });
        setIsPowered(false);
      }
    } catch (err) {
      setActionError(err.message ?? `System ${type} failed`);
    } finally {
      setSystemLoading(false);
    }
  };

  const handleNVToggle = async (requestedState) => {
    setCameraLoading(true);
    setActionError(null);
    try {
      await apiPostJson(`${PI_CAMERA_ENDPOINT}/nightvision`, {
        active: requestedState,
        ...(CAMERA_SECRET ? { secret: CAMERA_SECRET } : {}),
      });
      setNvActive(requestedState);
    } catch (err) {
      setActionError(err.message ?? "Night vision toggle failed");
    } finally {
      setCameraLoading(false);
    }
  };

  const handleResChange = async (newMode) => {
    setCameraLoading(true);
    setActionError(null);
    try {
      await apiPostJson(`${PI_CAMERA_ENDPOINT}/resolution`, {
        mode: newMode,
        ...(CAMERA_SECRET ? { secret: CAMERA_SECRET } : {}),
      });
      setResMode(newMode);
    } catch (err) {
      setActionError(err.message ?? "Resolution change failed");
    } finally {
      setCameraLoading(false);
    }
  };

  const handleFocusChange = async (newMode) => {
    setCameraLoading(true);
    setActionError(null);
    try {
      await apiPostJson(`${PI_CAMERA_ENDPOINT}/focus`, {
        mode: newMode,
        ...(CAMERA_SECRET ? { secret: CAMERA_SECRET } : {}),
      });
      setFocusMode(newMode);
    } catch (err) {
      setActionError(err.message ?? "Focus change failed");
    } finally {
      setCameraLoading(false);
    }
  };

  const toggleLight = async (state) => {
    setActionError(null);
    try {
      await apiPostJson(`${PI_SYSTEM_ENDPOINT}/usb-power`, { action: state });
    } catch (err) {
      setActionError(err.message ?? "Light toggle failed");
    }
  };

  const toggleDocking = async (isEnable) => {
    setActionError(null);
    try {
      await apiPostJson(PI_DOCKING_ENDPOINT, { enabled: isEnable });
    } catch (err) {
      setActionError(err.message ?? "Docking toggle failed");
    }
  };

  const handleCapture = async () => {
    setIsCapturing(true);
    setActionError(null);
    try {
      const data = await apiPost(PI_HI_RES_CAPTURE_ENDPOINT);
      const url = data?.url;
      if (url && isAllowedCaptureUrl(url)) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else if (url) {
        setActionError("Invalid capture URL");
      } else {
        setActionError("No capture URL returned");
      }
    } catch (err) {
      setActionError(err.message ?? "Capture failed");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCameraReset = async () => {
    setActionError(null);
    try {
      await apiPostJson(PI_CONTROL_ENDPOINT, { command: "reset_servos" });
    } catch (err) {
      setActionError(err.message ?? "Camera reset failed");
    }
  };

  return (
    <div className="viewport">
      {actionError && (
        <div className="glass-card action-error-banner" role="alert">
          <span>{actionError}</span>
          <button type="button" className="hud-dismiss" onClick={clearError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {!isAuthenticated && <LoginOverlay onLoginSuccess={handleLoginSuccess} />}
      <VideoStream dockingData={stats.docking} />
      <DriveAssistHUD pan={stats.pan} tilt={stats.tilt} />

      {isAuthenticated && (
        <div className="hud-overlay">
          <div className="hud-header">
            <div className="glass-card hud-header-brand">
              <div>Mango Rover V1.0</div>
              {stats?.wifiSignal && <WifiSignal dbm={stats.wifiSignal} />}
            </div>
            <div className="glass-card hud-header-actions">
            <SystemControls
              isPowered={isPowered}
              nvActive={nvActive}
              resMode={resMode}
              isCapturing={isCapturing}
              onNVToggle={handleNVToggle}
              onResChange={handleResChange}
              onAction={handleSystemAction}
              focusMode={focusMode}
              onFocusChange={handleFocusChange}
            />
              <FullscreenButton />
            </div>
          </div>

          <div className="hud-footer">
            {compact && !isMobile && (
              <RoverSchematic
                pan={stats.pan}
                battery={stats.battery}
                cpuTemp={stats.cpuTemp}
                latencyMs={stats.latency}
                isOffline={!piOnline}
                handleClick={() => setCompact(false)}
              />
            )}
            {compact && isMobile && (
              <DualJoystickControls
                onDrive={handleDriveUpdate}
                onReset={handleCameraReset}
              >
                <RoverSchematic
                  pan={stats.pan}
                  battery={stats.battery}
                  cpuTemp={stats.cpuTemp}
                  latencyMs={stats.latency}
                  isOffline={!piOnline}
                  handleClick={() => setCompact(false)}
                />
              </DualJoystickControls>
            )}
            {!compact && (
              <div className="drive-control-monitor glass-card">
                <div className="footer-metrics">
                  <SubsystemItem label="PI_SERVER" dotColor={piOnline ? "green" : "red"} />
                  <SubsystemItem label="ESP32" dotColor={isEspOnline ? "green" : "red"} />
                  <Meters stats={stats} compact={compact} />
                </div>
                <ChevronLeft onClick={() => setCompact(true)} aria-label="Collapse" />
              </div>
            )}

            <div className="footer-controls">
              {piOnline ? (
                <>
                  {!isMobile && (
                    <ControlCluster
                      onDockingToggle={toggleDocking}
                      onDrive={handleDriveUpdate}
                      usbPower={stats.usbPower}
                      onLightToggle={() => {
                        const nextState = stats.usbPower === "on" ? "off" : "on";
                        toggleLight(nextState);
                      }}
                      isDockingMode={stats.isDockingMode}
                      onCapture={handleCapture}
                      isCapturing={isCapturing}
                      onReset={handleCameraReset}
                    />
                  )}
                  {isMobile && !compact && (
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
