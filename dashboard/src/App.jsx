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
  VOICE_DRIVE_DEBUG,
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
import { AssistantPanel } from "./components/AssistantPanel";
import { useIsMobile, getIsMobileSnapshot } from "./hooks/useIsMobile";
import { useFullscreen } from "./hooks/useFullscreen";
import { usePiWebSocket } from "./hooks/usePiWebSocket";
import { useMqtt } from "./hooks/useMqtt";
import { useVoiceAssistant } from "./hooks/useVoiceAssistant";
import { useRoverSession } from "./context/RoverSessionContext";
import { apiPostJson, apiPost } from "./api/client";
import { isAllowedCaptureUrl } from "./api/capture";

/** Set true to show the floating voice-assistant panel again. */
const SHOW_ASSISTANT_AGENT_UI = false;

/** Voice/LLM gimbal-only sequences (nod, shake): used to center cam before & after. */
function isGimbalOnlyAssistantSequence(steps) {
  return (
    Array.isArray(steps) &&
    steps.length > 0 &&
    steps.every(
      (s) =>
        s?.type === "control" &&
        s.payload &&
        !s.payload.drive &&
        !s.payload.command &&
        s.payload.gimbal,
    )
  );
}

const GIMBAL_HOME_SETTLE_MS = 600;

const CONTROL_MODE_STORAGE_KEY = "rover-dashboard-control-mode";

function readInitialControlMode() {
  if (typeof window === "undefined") return "keyboard";
  try {
    const v = window.localStorage.getItem(CONTROL_MODE_STORAGE_KEY);
    if (v === "keyboard" || v === "joystick") return v;
  } catch {
    /* ignore */
  }
  return getIsMobileSnapshot() ? "joystick" : "keyboard";
}

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
  const [controlMode, setControlModeState] = useState(readInitialControlMode);

  const setControlMode = (mode) => {
    if (mode !== "keyboard" && mode !== "joystick") return;
    setControlModeState(mode);
    try {
      window.localStorage.setItem(CONTROL_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };
  const [actionError, setActionError] = useState(null);
  const [, setSystemLoading] = useState(false);
  const [, setCameraLoading] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [videoStreamReady, setVideoStreamReady] = useState(false);

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

  /** Avoid stuck drive/gimbal when swapping input surfaces. */
  useEffect(() => {
    if (!isAuthenticated || !piOnline) return;
    void sendControlNow({ drive: { x: 0, y: 0 }, gimbal: { x: 0, y: 0 } });
  }, [controlMode, isAuthenticated, piOnline]);

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
      setActionError(err.message ?? "Drive mode update failed");
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

  const runAssistantAction = async (action) => {
    if (!action || typeof action !== "object") return;
    if (VOICE_DRIVE_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug("[voice→drive] assistant action", action);
    }
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    if (action.type === "sequence" && Array.isArray(action.actions)) {
      const steps = action.actions.slice(0, 10);
      const gimbalOnly = isGimbalOnlyAssistantSequence(steps);
      if (gimbalOnly) {
        await sendControlNow({ gimbal: { x: 0, y: 0 } });
        await sleep(GIMBAL_HOME_SETTLE_MS);
      }
      for (let i = 0; i < steps.length; i += 1) {
        // Execute in-order for compound command reliability.
        // eslint-disable-next-line no-await-in-loop
        await runAssistantAction(steps[i]);
        if (i < steps.length - 1) {
          if (gimbalOnly) {
            // Gimbal gestures are hold-based; avoid injecting drive-stop and keep a gentler cadence.
            // eslint-disable-next-line no-await-in-loop
            await sleep(220);
          } else {
            // Brief full stop between drive stages so timed segments do not blend into a curve.
            // eslint-disable-next-line no-await-in-loop
            await sendControlNow({ drive: { x: 0, y: 0 } });
            // eslint-disable-next-line no-await-in-loop
            await sleep(120);
          }
        }
      }
      if (gimbalOnly) {
        await sendControlNow({ gimbal: { x: 0, y: 0 } });
        await sleep(GIMBAL_HOME_SETTLE_MS);
      }
      return;
    }

    if (action.type === "control") {
      const payload = action.payload;
      if (!payload) return;
      if (VOICE_DRIVE_DEBUG) {
        // eslint-disable-next-line no-console
        console.debug("[voice→drive] sendControl payload", payload);
      }
      await sendControlNow(payload);
      if (action.durationMs && !payload.command) {
        if (payload.drive) {
          await sleep(action.durationMs);
          await sendControlNow({ drive: { x: 0, y: 0 } });
        } else if (payload.gimbal) {
          await sleep(action.durationMs);
        }
      }
      return;
    }
    if (action.type === "usb_power" && (action.action === "on" || action.action === "off")) {
      await toggleLight(action.action);
      return;
    }
    if (action.type === "camera") {
      if (action.action === "capture") {
        await handleCapture();
        return;
      }
      if (action.action === "nightvision" && typeof action.active === "boolean") {
        await handleNVToggle(action.active);
        return;
      }
      if (action.action === "focus" && action.mode) {
        await handleFocusChange(action.mode);
        return;
      }
      if (action.action === "resolution" && action.mode) {
        await handleResChange(action.mode);
        return;
      }
      return;
    }
    if (action.type === "quiet_mode" && typeof action.enabled === "boolean") {
      await setQuietMode(action.enabled);
    }
  };

  const {
    isSupported: voiceSupported,
    isListening: voiceListening,
    isLiveMode: voiceLiveMode,
    isThinking: voiceThinking,
    lastTranscript,
    assistantReply,
    voiceError,
    startListening: startVoice,
    stopListening: stopVoice,
    setLiveMode: setVoiceLiveMode,
    sendText: sendVoiceText,
  } = useVoiceAssistant({ onAction: runAssistantAction });

  return (
    <div
      className={`viewport${isPointerLocked ? " viewport-mouse-look" : ""}`}
      ref={viewportRef}
    >
      <ActionErrorBanner message={actionError} onDismiss={clearError} />
      {SHOW_ASSISTANT_AGENT_UI && (
        <AssistantPanel
          videoStreamReady={videoStreamReady}
          voiceSupported={voiceSupported}
          isListening={voiceListening}
          isLiveMode={voiceLiveMode}
          isThinking={voiceThinking}
          transcript={lastTranscript}
          reply={assistantReply}
          error={voiceError}
          onSendText={sendVoiceText}
          onSetLiveMode={setVoiceLiveMode}
        />
      )}

      {!isAuthenticated && (
        <LoginOverlay onLoginSuccess={handleLoginSuccess} />
      )}

      <VideoStream
        dockingData={stats.docking}
        onVideoReadyChange={setVideoStreamReady}
      />
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
            controlMode={controlMode}
            onControlModeChange={setControlMode}
          />

          <HudFooter
            compact={compact}
            isMobile={isMobile}
            controlMode={controlMode}
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
            onVoiceStart={startVoice}
            onVoiceStop={stopVoice}
            voiceSupported={voiceSupported}
            voiceListening={voiceListening}
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
  controlMode,
  onControlModeChange,
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
          controlMode={controlMode}
          onControlModeChange={onControlModeChange}
        />
        <FullscreenButton />
      </div>
    </div>
  );
}

function HudFooter({
  compact,
  isMobile,
  controlMode,
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
  onVoiceStart,
  onVoiceStop,
  voiceSupported,
  voiceListening,
  onToggleLight,
  onCapture,
  isCapturing,
  onDockingToggle,
}) {
  const joystickProps = {
    onDrive,
    onReset: onResetCamera,
    onLookDown,
    onTurnLeft,
    onTurnRight,
    onLaserToggle,
    laserOn,
    onVoiceStart,
    onVoiceStop,
    voiceSupported,
    voiceListening,
    onHeadlightToggle: () => {
      const nextState = stats.usbPower === "on" ? "off" : "on";
      onToggleLight(nextState);
    },
    headlightOn: stats.usbPower === "on",
  };

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

  /** Joystick mode always uses the compact HUD layout (schematic + stick placement). */
  const layoutCompact = controlMode === "joystick" || compact;

  return (
    <div className="hud-footer">
      {layoutCompact && !isMobile && controlMode === "keyboard" && schematic}

      {isMobile && controlMode === "joystick" && (
        <DualJoystickControls {...joystickProps}>{schematic}</DualJoystickControls>
      )}

      {compact && isMobile && controlMode === "keyboard" && schematic}

      {!layoutCompact && (
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
            {!isMobile && controlMode === "keyboard" && (
              <ControlCluster
                onDockingToggle={onDockingToggle}
                onDrive={onDrive}
                usbPower={stats.usbPower}
                laserOn={laserOn}
                onVoiceStart={onVoiceStart}
                onVoiceStop={onVoiceStop}
                voiceSupported={voiceSupported}
                voiceListening={voiceListening}
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
            {!isMobile && controlMode === "joystick" && (
              <DualJoystickControls {...joystickProps}>
                {schematic}
              </DualJoystickControls>
            )}

            {isMobile && controlMode === "keyboard" && (
              <ControlCluster
                onDockingToggle={onDockingToggle}
                onDrive={onDrive}
                usbPower={stats.usbPower}
                laserOn={laserOn}
                onVoiceStart={onVoiceStart}
                onVoiceStop={onVoiceStop}
                voiceSupported={voiceSupported}
                voiceListening={voiceListening}
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
          </>
        ) : null}
      </div>
    </div>
  );
}

