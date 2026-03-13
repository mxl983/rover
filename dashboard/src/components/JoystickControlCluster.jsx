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

  useEffect(() => {
    onDriveRef.current = onDrive;
  }, [onDrive]);

  const sendAnalog = () => {
    if (onDriveRef.current) {
      onDriveRef.current({
        drive: { ...analogState.current.drive },
        gimbal: { ...analogState.current.gimbal },
      });
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

    const driveManager = nipplejs.create({
      ...commonOptions,
      zone: leftEl,
      color: "rgba(255, 255, 255, 0.3)",
    });

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

    driveManager.on("move", (evt, data) => {
      analogState.current.drive = toAnalog(data);
      sendAnalog();
    });

    driveManager.on("end", () => {
      analogState.current.drive = { x: 0, y: 0 };
      sendAnalog();
    });

    lookManager.on("move", (evt, data) => {
      analogState.current.gimbal = toAnalog(data);
      sendAnalog();
    });

    lookManager.on("end", () => {
      analogState.current.gimbal = { x: 0, y: 0 };
      sendAnalog();
    });

    return () => {
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