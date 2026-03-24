import { useEffect, useState, useRef } from "react";
import { VideoStream } from "./components/VideoStream";
import { SubsystemItem } from "./components/SubSystemItem";
import { Meters } from "./components/Meters";
import { ControlCluster } from "./components/ControlCluster";
import {
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
import { MouseGimbalLayer } from "./components/MouseGimbalLayer";
import { MobileTouchGimbalLayer } from "./components/MobileTouchGimbalLayer";
import { useIsMobile } from "./hooks/useIsMobile";
import { useFullscreen } from "./hooks/useFullscreen";
import { usePiWebSocket } from "./hooks/usePiWebSocket";
import { useMqtt } from "./hooks/useMqtt";
import { useRoverSession } from "./context/RoverSessionContext";
import { apiPostJson, apiPost } from "./api/client";
import { isAllowedCaptureUrl } from "./api/capture";

export default function App() {
  const { isAuthenticated, sessionCreds, login, logout } = useRoverSession();
  const { stats, isOnline: piOnline, sendControl } = usePiWebSocket();
  const { isEspOnline, mqttClientRef } = useMqtt(
    isAuthenticated ? sessionCreds : null,
  );

  const [isPowered, setIsPowered] = useState(true);
  const [nvActive, setNvActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [resMode, setResMode] = useState("720p");
  const [focusMode, setFocusMode] = useState("far");
  const [compact, setCompact] = useState(true);
  const [actionError, setActionError] = useState(null);
  const [, setSystemLoading] = useState(false);
  const [, setCameraLoading] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const isMobile = useIsMobile();
  const isFullscreen = useFullscreen();
  const viewportRef = useRef(null);
  const lastDriveRef = useRef({ x: 0, y: 0 });
  const pendingControlRef = useRef(null);
  const controlTimerRef = useRef(null);

  const CONTROL_INTERVAL_WS_MS = 16; // ~60Hz for low-latency websocket control

  useEffect(() => {
    setIsPowered(piOnline);
  }, [piOnline]);

  const clearError = () => setActionError(null);
  const clearErrorIfAny = () => setActionError((prev) => (prev ? null : prev));

  const sendControlNow = (payload) => {
    if (piOnline && sendControl) {
      sendControl(payload);
      return Promise.resolve();
    }
    setActionError("Control channel offline (WebSocket not connected)");
    return Promise.resolve();
  };

  const flushPendingControl = () => {
    controlTimerRef.current = null;
    const payload = pendingControlRef.current;
    if (!payload) return;
    pendingControlRef.current = null;
    void sendControlNow(payload);
  };

  const queueControl = (patch) => {
    const prev = pendingControlRef.current ?? {};
    pendingControlRef.current = { ...prev, ...patch };
    if (controlTimerRef.current != null) return;
    controlTimerRef.current = setTimeout(flushPendingControl, CONTROL_INTERVAL_WS_MS);
  };

  useEffect(
    () => () => {
      if (controlTimerRef.current != null) {
        clearTimeout(controlTimerRef.current);
        controlTimerRef.current = null;
      }
    },
    [],
  );

  const handleDriveUpdate = (payload) => {
    clearErrorIfAny();
    if (Array.isArray(payload)) {
      // Keyboard control arrays are sparse and should remain immediate.
      void sendControlNow(payload);
      return;
    }
    if (typeof payload === "object" && payload?.drive != null) {
      lastDriveRef.current = payload.drive;
    }
    if (typeof payload === "object" && payload) {
      queueControl(payload);
    }
  };

  const handleGimbalUpdate = (gimbal) => {
    clearErrorIfAny();
    queueControl({ gimbal });
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
        mqttClientRef.current?.publish("rover/power/pi", "Off 15000", {
          qos: 1,
        });
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

  const setQuietMode = async (enabled) => {
    setActionError(null);
    try {
      await apiPostJson(`${PI_SYSTEM_ENDPOINT}/quiet-mode`, { enabled });
    } catch (err) {
      setActionError(err.message ?? "Quiet mode update failed");
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
    await sendControlNow({ command: "reset_servos" });
  };

  const handleLookDown = async () => {
    setActionError(null);
    await sendControlNow({ command: "look_down" });
  };

  const handleQuickTurn = async (dir) => {
    setActionError(null);
    const command =
      dir === "L" ? "turn_left_90_slow" : "turn_right_90_slow";
    await sendControlNow({ command });
  };

  const handleLaserToggle = async () => {
    setActionError(null);
    await sendControlNow({ command: "toggle_laser" });
  };

  return (
    <div
      className={`viewport${isPointerLocked ? " viewport-mouse-look" : ""}`}
      ref={viewportRef}
    >
      <ActionErrorBanner message={actionError} onDismiss={clearError} />

      {!isAuthenticated && (
        <LoginOverlay onLoginSuccess={handleLoginSuccess} />
      )}

      <VideoStream dockingData={stats.docking} />
      <DriveAssistHUD pan={stats.pan} tilt={stats.tilt} />

      {isAuthenticated && isMobile && (
        <MobileTouchGimbalLayer
          onGimbal={handleGimbalUpdate}
        />
      )}

      {isAuthenticated && isFullscreen && !isMobile && (
        <MouseGimbalLayer
          viewportRef={viewportRef}
          isFullscreen={isFullscreen}
          isPointerLocked={isPointerLocked}
          onPointerLockChange={setIsPointerLocked}
          onDrive={handleDriveUpdate}
          lastDriveRef={lastDriveRef}
        />
      )}

      {isAuthenticated && (
        <div className="hud-overlay">
          <HudHeader
            wifiSignal={stats?.wifiSignal}
            isPowered={isPowered}
            nvActive={nvActive}
            resMode={resMode}
            isCapturing={isCapturing}
            focusMode={focusMode}
            quietMode={stats?.quietMode}
            onQuietModeChange={setQuietMode}
            onNVToggle={handleNVToggle}
            onResChange={handleResChange}
            onAction={handleSystemAction}
            onFocusChange={handleFocusChange}
          />

          <HudFooter
            compact={compact}
            isMobile={isMobile}
            stats={stats}
            piOnline={piOnline}
            isEspOnline={isEspOnline}
            onToggleCompact={setCompact}
            onDrive={handleDriveUpdate}
            onResetCamera={handleCameraReset}
            onLookDown={handleLookDown}
            onTurnLeft={() => handleQuickTurn("L")}
            onTurnRight={() => handleQuickTurn("R")}
            onLaserToggle={handleLaserToggle}
            laserOn={stats.laserOn}
            onToggleLight={toggleLight}
            onCapture={handleCapture}
            isCapturing={isCapturing}
            onDockingToggle={toggleDocking}
          />
        </div>
      )}
    </div>
  );
}

function ActionErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="glass-card action-error-banner" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="hud-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

function HudHeader({
  wifiSignal,
  isPowered,
  nvActive,
  resMode,
  isCapturing,
  focusMode,
  quietMode,
  onQuietModeChange,
  onNVToggle,
  onResChange,
  onAction,
  onFocusChange,
}) {
  return (
    <div className="hud-header">
      <div className="glass-card hud-header-brand">
        <div>Mango Mate</div>
        {wifiSignal && <WifiSignal dbm={wifiSignal} />}
      </div>
      <div className="glass-card hud-header-actions">
        <SystemControls
          isPowered={isPowered}
          nvActive={nvActive}
          resMode={resMode}
          isCapturing={isCapturing}
          quietMode={quietMode}
          onQuietModeChange={onQuietModeChange}
          onNVToggle={onNVToggle}
          onResChange={onResChange}
          onAction={onAction}
          focusMode={focusMode}
          onFocusChange={onFocusChange}
        />
        <FullscreenButton />
      </div>
    </div>
  );
}

function HudFooter({
  compact,
  isMobile,
  stats,
  piOnline,
  isEspOnline,
  onToggleCompact,
  onDrive,
  onResetCamera,
  onLookDown,
  onTurnLeft,
  onTurnRight,
  onLaserToggle,
  laserOn,
  onToggleLight,
  onCapture,
  isCapturing,
  onDockingToggle,
}) {
  const schematic = (
    <RoverSchematic
      pan={stats.pan}
      battery={stats.battery}
      cpuTemp={stats.cpuTemp}
      latencyMs={stats.latency}
      throttle={stats.throttle}
      isOffline={!piOnline}
      isCharging={stats.isCharging}
      handleClick={() => onToggleCompact(false)}
    />
  );

  return (
    <div className="hud-footer">
      {compact && !isMobile && schematic}

      {compact && isMobile && (
        <DualJoystickControls
          onDrive={onDrive}
          onReset={onResetCamera}
          onLookDown={onLookDown}
          onTurnLeft={onTurnLeft}
          onTurnRight={onTurnRight}
          onLaserToggle={onLaserToggle}
          laserOn={laserOn}
          onHeadlightToggle={() => {
            const nextState = stats.usbPower === "on" ? "off" : "on";
            onToggleLight(nextState);
          }}
          headlightOn={stats.usbPower === "on"}
        >
          {schematic}
        </DualJoystickControls>
      )}

      {!compact && (
        <div className="drive-control-monitor glass-card">
          <div className="footer-metrics">
            <SubsystemItem
              label="PI_SERVER"
              dotColor={piOnline ? "green" : "red"}
            />
            <SubsystemItem
              label="ESP32"
              dotColor={isEspOnline ? "green" : "red"}
            />
            <Meters stats={stats} compact={compact} />
          </div>
          <ChevronLeft
            onClick={() => onToggleCompact(true)}
            aria-label="Collapse"
          />
        </div>
      )}

      <div className="footer-controls">
        {piOnline ? (
          <>
            {!isMobile && (
              <ControlCluster
                onDockingToggle={onDockingToggle}
                onDrive={onDrive}
                usbPower={stats.usbPower}
                laserOn={laserOn}
                onLightToggle={() => {
                  const nextState =
                    stats.usbPower === "on" ? "off" : "on";
                  onToggleLight(nextState);
                }}
                onLaserToggle={onLaserToggle}
                isDockingMode={stats.isDockingMode}
                onCapture={onCapture}
                isCapturing={isCapturing}
                onReset={onResetCamera}
              />
            )}
            {isMobile && !compact && (
              <DualJoystickControls
                onDrive={onDrive}
                onReset={onResetCamera}
                onLookDown={onLookDown}
                onTurnLeft={onTurnLeft}
                onTurnRight={onTurnRight}
                onLaserToggle={onLaserToggle}
                laserOn={laserOn}
                onHeadlightToggle={() => {
                  const nextState = stats.usbPower === "on" ? "off" : "on";
                  onToggleLight(nextState);
                }}
                headlightOn={stats.usbPower === "on"}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
