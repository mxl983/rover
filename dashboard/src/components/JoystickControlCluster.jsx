import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import nipplejs from "nipplejs";

const ZONE_SIZE_PX = 160;
const ZONE_SIZE_SMALL_PX = 120;
const RESET_BTN_SIZE = 50;
const NEUTRAL_BORDER = "rgba(255, 255, 255, 0.2)";
const NEUTRAL_LABEL = "rgba(255, 255, 255, 0.75)";
const NEUTRAL_BTN = "rgba(255, 255, 255, 0.25)";

export const DualJoystickControls = ({ onDrive, onReset, children }) => {
  const leftZoneRef = useRef(null);
  const rightZoneRef = useRef(null);
  const managersRef = useRef({ drive: null, look: null });

  const onDriveRef = useRef(onDrive);
  const activeKeys = useRef({ drive: "", look: "" });

  useEffect(() => {
    onDriveRef.current = onDrive;
  }, [onDrive]);

  useEffect(() => {
    const leftEl = leftZoneRef.current;
    const rightEl = rightZoneRef.current;
    if (!leftEl || !rightEl) return;

    const commonOptions = {
      mode: "static",
      position: { left: "50%", top: "50%" },
      size: 130,
      threshold: 0.1,
      catchDistance: 150,
    };

    const driveManager = nipplejs.create({
      ...commonOptions,
      zone: leftEl,
      color: "#8a8a8a",
    });

    const lookManager = nipplejs.create({
      ...commonOptions,
      zone: rightEl,
      color: "#8a8a8a",
    });

    managersRef.current.drive = driveManager;
    managersRef.current.look = lookManager;

    const syncState = () => {
      const keysToSend = [];
      if (activeKeys.current.drive) keysToSend.push(activeKeys.current.drive);
      if (activeKeys.current.look) keysToSend.push(activeKeys.current.look);
      if (onDriveRef.current) {
        onDriveRef.current(keysToSend);
      }
    };

    driveManager.on("move", (evt, data) => {
      if (!data.direction) return;
      const map = { up: "w", down: "s", left: "a", right: "d" };
      const key = map[data.direction.angle];
      if (activeKeys.current.drive !== key) {
        activeKeys.current.drive = key;
        syncState();
      }
    });

    driveManager.on("end", () => {
      activeKeys.current.drive = "";
      syncState();
    });

    lookManager.on("move", (evt, data) => {
      if (!data.direction) return;
      const map = {
        up: "ArrowUp",
        down: "ArrowDown",
        left: "ArrowLeft",
        right: "ArrowRight",
      };
      const key = map[data.direction.angle];
      if (activeKeys.current.look !== key) {
        activeKeys.current.look = key;
        syncState();
      }
    });

    lookManager.on("end", () => {
      activeKeys.current.look = "";
      syncState();
    });

    return () => {
      driveManager.destroy();
      lookManager.destroy();
      managersRef.current.drive = null;
      managersRef.current.look = null;
    };
  }, []);

  return (
    <div className="joystick-hud-container" role="group" aria-label="Dual joystick controls">
      <style>{`
        .joystick-hud-container {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          min-height: 200px;
          height: max(200px, 22vh);
          max-height: 260px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: clamp(8px, 3vw, 24px);
          padding: 12px clamp(16px, 5vw, 100px) max(12px, env(safe-area-inset-bottom)) clamp(16px, 5vw, 100px);
          box-sizing: border-box;
          pointer-events: none;
          z-index: 9999;
        }
        .joystick-hud-container > * {
          pointer-events: auto;
        }
        .j-zone {
          width: min(${ZONE_SIZE_PX}px, 40vw);
          height: min(${ZONE_SIZE_PX}px, 40vw);
          min-width: ${ZONE_SIZE_SMALL_PX}px;
          min-height: ${ZONE_SIZE_SMALL_PX}px;
          aspect-ratio: 1;
          flex-shrink: 0;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid ${NEUTRAL_BORDER};
          border-radius: 50%;
          position: relative;
          touch-action: none;
          -webkit-tap-highlight-color: transparent;
          box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.3);
        }
        .j-zone::after {
          content: '';
          display: block;
          position: absolute;
          inset: 0;
          border-radius: 50%;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.06);
          pointer-events: none;
        }
        @media (max-width: 380px) {
          .j-zone {
            width: ${ZONE_SIZE_SMALL_PX}px;
            height: ${ZONE_SIZE_SMALL_PX}px;
          }
        }
        .j-label {
          position: absolute;
          top: -22px;
          left: 0;
          right: 0;
          text-align: center;
          font-family: 'Segoe UI', sans-serif;
          font-size: clamp(9px, 2.2vw, 11px);
          letter-spacing: 0.12em;
          font-weight: 600;
          text-shadow: 0 0 12px rgba(0,0,0,0.9);
          pointer-events: none;
        }
        .reset-btn {
          width: ${RESET_BTN_SIZE}px;
          height: ${RESET_BTN_SIZE}px;
          min-width: 44px;
          min-height: 44px;
          border-radius: 50%;
          background: ${NEUTRAL_BTN};
          border: 1px solid rgba(255, 255, 255, 0.35);
          color: rgba(255, 255, 255, 0.9);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s ease, background 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 0 12px rgba(0, 0, 0, 0.2);
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .reset-btn:hover {
          background: rgba(255, 255, 255, 0.35);
          box-shadow: 0 0 16px rgba(0, 0, 0, 0.25);
        }
        .reset-btn:active {
          transform: scale(0.92);
          background: rgba(255, 255, 255, 0.5);
          color: #000;
        }
        .reset-btn:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.8);
          outline-offset: 2px;
        }
        .joystick-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .joystick-center-slot {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 0;
          padding-bottom: 4px;
        }
      `}</style>

      <div ref={leftZoneRef} className="j-zone" aria-label="Drive joystick (WASD)">
        <div className="j-label" style={{ color: NEUTRAL_LABEL }}>
          DRIVE
        </div>
      </div>

      <div className="joystick-center">
        <button
          type="button"
          className="reset-btn"
          onClick={() => onReset?.()}
          title="Reset camera gimbal to center"
          aria-label="Reset camera gimbal"
        >
          RST
        </button>
        {children ? <div className="joystick-center-slot">{children}</div> : null}
      </div>

      <div ref={rightZoneRef} className="j-zone" aria-label="Gimbal joystick (camera look)">
        <div className="j-label" style={{ color: NEUTRAL_LABEL }}>
          GIMBAL
        </div>
      </div>
    </div>
  );
};

DualJoystickControls.propTypes = {
  onDrive: PropTypes.func.isRequired,
  onReset: PropTypes.func,
  children: PropTypes.node,
};
