import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import nipplejs from "nipplejs";

const ZONE_SIZE_PX = 100;
const RESET_BTN_SIZE = 20; 
const NEUTRAL_BORDER = "rgba(255, 255, 255, 0.2)";
const NEUTRAL_LABEL = "rgba(255, 255, 255, 0.75)";
const NEUTRAL_BTN = "rgba(10, 10, 10, 0.9)"; 

export const DualJoystickControls = ({ onDrive, onReset, children }) => {
  const leftZoneRef = useRef(null);
  const rightZoneRef = useRef(null);
  const managersRef = useRef({ drive: null, look: null });

  const onDriveRef = useRef(onDrive);
  const analogState = useRef({
    drive: { x: 0, y: 0 },
    gimbal: { x: 0, y: 0 },
  });
  const lastSentRef = useRef({ drive: null, gimbal: null });
  const DRIVE_CHANGE_THRESHOLD = 0.04;
  const gimbalRafRef = useRef(null);

  useEffect(() => {
    onDriveRef.current = onDrive;
  }, [onDrive]);

  const driveStateChanged = (a, b) =>
    a === null ||
    b === null ||
    Math.abs((a.x ?? 0) - (b.x ?? 0)) > DRIVE_CHANGE_THRESHOLD ||
    Math.abs((a.y ?? 0) - (b.y ?? 0)) > DRIVE_CHANGE_THRESHOLD;

  const sendState = (drive, gimbal, updateLast = true) => {
    if (updateLast) lastSentRef.current = { drive: { ...drive }, gimbal: { ...gimbal } };
    if (onDriveRef.current) onDriveRef.current({ drive, gimbal });
  };

  const sendIfChanged = (isStop = false) => {
    const drive = { ...analogState.current.drive };
    const gimbal = { ...analogState.current.gimbal };
    const last = lastSentRef.current;
    const driveChanged = isStop || driveStateChanged(drive, last.drive);
    const gimbalChanged =
      isStop ||
      last.gimbal === null ||
      Math.abs((gimbal.x ?? 0) - (last.gimbal.x ?? 0)) > 0.01 ||
      Math.abs((gimbal.y ?? 0) - (last.gimbal.y ?? 0)) > 0.01;
    if (!driveChanged && !gimbalChanged) return;
    sendState(drive, gimbal);
  };

  const startGimbalRaf = () => {
    if (gimbalRafRef.current) return;
    const tick = () => {
      const drive = { ...analogState.current.drive };
      const gimbal = { ...analogState.current.gimbal };
      const mag = Math.sqrt((gimbal.x ?? 0) ** 2 + (gimbal.y ?? 0) ** 2);
      if (mag < 0.02) {
        gimbalRafRef.current = null;
        return;
      }
      sendState(drive, gimbal);
      gimbalRafRef.current = requestAnimationFrame(tick);
    };
    gimbalRafRef.current = requestAnimationFrame(tick);
  };

  const stopGimbalRaf = () => {
    if (gimbalRafRef.current) {
      cancelAnimationFrame(gimbalRafRef.current);
      gimbalRafRef.current = null;
    }
  };

  useEffect(() => {
    const leftEl = leftZoneRef.current;
    const rightEl = rightZoneRef.current;
    if (!leftEl || !rightEl) return;

    const commonOptions = {
      mode: "static",
      position: { left: "50%", top: "50%" },
      size: 110,
      threshold: 0.05,
      catchDistance: 150,
    };

    // Drive stick: larger zone, lower threshold, bigger catch for easier straight-line fwd/back
    const driveOptions = {
      ...commonOptions,
      zone: leftEl,
      color: "rgba(255, 255, 255, 0.3)",
      size: 130,
      threshold: 0.03,
      catchDistance: 200,
    };

    const driveManager = nipplejs.create(driveOptions);
    const lookManager = nipplejs.create({
      ...commonOptions,
      zone: rightEl,
      color: "rgba(255, 255, 255, 0.3)",
    });

    managersRef.current.drive = driveManager;
    managersRef.current.look = lookManager;

    const toAnalog = (data) => {
      const force = typeof data.force === "number" ? data.force : (data.distance ? Math.min(1, data.distance / 50) : 1);
      if (data.vector && typeof data.vector.x === "number" && typeof data.vector.y === "number") {
        return { x: data.vector.x * force, y: -data.vector.y * force };
      }
      const rad = data.angle?.radian ?? 0;
      return { x: Math.cos(rad) * force, y: -Math.sin(rad) * force };
    };

    // Gimbal: linear and less sensitive (scale down so small drag = proportional movement)
    const GIMBAL_LINEAR_SCALE = 0.58;
    const toGimbalAnalog = (data) => {
      const raw = toAnalog(data);
      return {
        x: Math.max(-1, Math.min(1, raw.x * GIMBAL_LINEAR_SCALE)),
        y: Math.max(-1, Math.min(1, raw.y * GIMBAL_LINEAR_SCALE)),
      };
    };

    // Wider forward/back capture: when mostly fwd/back, reduce lateral so straight line is easier
    const toDriveAnalog = (data) => {
      const raw = toAnalog(data);
      const ax = raw.x;
      const ay = raw.y;
      const absY = Math.abs(ay);
      const absX = Math.abs(ax);
      if (absY >= 0.25 && absY >= absX) {
        const forwardBackScale = 0.35;
        return { x: ax * forwardBackScale, y: ay };
      }
      return raw;
    };

    driveManager.on("move", (evt, data) => {
      analogState.current.drive = toDriveAnalog(data);
      sendIfChanged(false);
    });

    driveManager.on("end", () => {
      analogState.current.drive = { x: 0, y: 0 };
      sendIfChanged(true);
    });

    lookManager.on("move", (evt, data) => {
      analogState.current.gimbal = toGimbalAnalog(data);
      startGimbalRaf();
    });

    lookManager.on("end", () => {
      stopGimbalRaf();
      analogState.current.gimbal = { x: 0, y: 0 };
      sendIfChanged(true);
      const retryStop = () => {
        if (onDriveRef.current) {
          onDriveRef.current({
            drive: { x: 0, y: 0 },
            gimbal: { x: 0, y: 0 },
          });
        }
      };
      setTimeout(retryStop, 60);
      setTimeout(retryStop, 140);
    });

    return () => {
      if (gimbalRafRef.current) {
        cancelAnimationFrame(gimbalRafRef.current);
        gimbalRafRef.current = null;
      }
      driveManager.destroy();
      lookManager.destroy();
    };
  }, []);

  return (
    <div className="joystick-hud-container">
      <style>{`
        .joystick-hud-container {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          height: 220px;
          display: flex;
          justify-content: space-between;
          align-items: self-end;
          padding: 0 5vw 20px 5vw;
          box-sizing: border-box;
          pointer-events: none;
          z-index: 9999;
        }

        /* Fixed container size prevents shifting layout */
        .joystick-wrapper {
          position: relative;
          width: ${ZONE_SIZE_PX}px;
          height: ${ZONE_SIZE_PX}px;
          pointer-events: none;
          flex-shrink: 0;
        }

        .j-zone {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid ${NEUTRAL_BORDER};
          border-radius: 50%;
          pointer-events: auto;
          touch-action: none;
          box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.4);
        }

        .j-label {
          position: absolute;
          top: -24px;
          left: 0;
          right: 0;
          text-align: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 700;
          pointer-events: none;
          color: ${NEUTRAL_LABEL};
        }

        .reset-btn-sibling {
          position: absolute;
          /* Fixed offset outside the circle */
          top: -8px;
          left: -8px;
          width: ${RESET_BTN_SIZE}px;
          height: ${RESET_BTN_SIZE}px;
          border-radius: 20px;
          background: ${NEUTRAL_BTN};
          border: 1.5px solid #00f2ff;
          color: #00f2ff;
          font-size: 10px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          pointer-events: auto;
          z-index: 10001; 
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 242, 255, 0.2);
          /* Transitioning only non-layout properties for stability */
          transition: transform 0.1s, background 0.15s, color 0.15s;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        
        .reset-btn-sibling:active {
          transform: scale(0.9);
          background: #00f2ff;
          color: #000;
        }

        .center-slot {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          pointer-events: none;
          gap: 12px;
        }
        .center-slot > * {
          pointer-events: auto;
        }
      `}</style>

      {/* LEFT JOYSTICK: DRIVE */}
      <div className="joystick-wrapper">
        <div ref={leftZoneRef} className="j-zone">
          <div className="j-label">Drive</div>
        </div>
      </div>

      {/* HUD CENTER: (Schematics, Status, etc.) */}
      <div className="center-slot">
        {children}
      </div>

      {/* RIGHT JOYSTICK: GIMBAL + SIBLING RST BUTTON */}
      <div className="joystick-wrapper">
        <div ref={rightZoneRef} className="j-zone">
          <div className="j-label">Gimbal</div>
        </div>
        
        <button
          type="button"
          className="reset-btn-sibling"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReset?.();
          }}
          style={{
            borderRadius: "20px",
          }}
          // Extra safety to ensure nipplejs doesn't see the start of the touch
          onPointerDown={(e) => e.stopPropagation()}
        >
          RST
        </button>
      </div>
    </div>
  );
};

DualJoystickControls.propTypes = {
  onDrive: PropTypes.func.isRequired,
  onReset: PropTypes.func,
  children: PropTypes.node,
};