import React, { useEffect, useRef } from "react";
import nipplejs from "nipplejs";

export const DualJoystickControls = ({ onDrive, onReset }) => {
  const leftZoneRef = useRef(null);
  const rightZoneRef = useRef(null);
  const managers = useRef({ drive: null, look: null });

  const onDriveRef = useRef(onDrive);
  const activeKeys = useRef({ drive: "", look: "" });

  useEffect(() => {
    onDriveRef.current = onDrive;
  }, [onDrive]);

  useEffect(() => {
    const commonOptions = {
      mode: "static",
      position: { left: "50%", top: "50%" },
      size: 130,
      threshold: 0.1,
      catchDistance: 150,
    };

    managers.current.drive = nipplejs.create({
      ...commonOptions,
      zone: leftZoneRef.current,
      color: "#00f2ff",
    });

    managers.current.look = nipplejs.create({
      ...commonOptions,
      zone: rightZoneRef.current,
      color: "#ffea00",
    });

    const syncState = () => {
      const keysToSend = [];
      if (activeKeys.current.drive) keysToSend.push(activeKeys.current.drive);
      if (activeKeys.current.look) keysToSend.push(activeKeys.current.look);

      if (onDriveRef.current) {
        onDriveRef.current(keysToSend);
      }
    };

    // DRIVE (WASD)
    managers.current.drive.on("move", (evt, data) => {
      if (!data.direction) return;
      const map = { up: "w", down: "s", left: "a", right: "d" };
      const key = map[data.direction.angle];
      if (activeKeys.current.drive !== key) {
        activeKeys.current.drive = key;
        syncState();
      }
    });

    managers.current.drive.on("end", () => {
      activeKeys.current.drive = "";
      syncState();
    });

    // CAMERA (ARROWS)
    managers.current.look.on("move", (evt, data) => {
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

    managers.current.look.on("end", () => {
      activeKeys.current.look = "";
      syncState();
    });

    return () => {
      if (managers.current.drive) managers.current.drive.destroy();
      if (managers.current.look) managers.current.look.destroy();
    };
  }, []);

  return (
    <div className="joystick-hud-container">
      <style>{`
        .joystick-hud-container {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100vw;
          height: 220px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 100px 0 100px;
          box-sizing: border-box;
          pointer-events: none;
          z-index: 9999;
        }
        .j-zone {
          width: 160px;
          height: 160px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(0, 242, 255, 0.2);
          border-radius: 50%;
          position: relative;
          pointer-events: auto !important;
          touch-action: none;
        }
        .j-label {
          position: absolute;
          top: -25px;
          width: 100%;
          text-align: center;
          font-family: 'Segoe UI', monospace;
          font-size: 10px;
          letter-spacing: 2px;
          font-weight: bold;
          text-shadow: 0 0 10px rgba(0,0,0,1);
        }
        .reset-btn {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(255, 234, 0, 0.1);
          border: 1px solid #ffea00;
          color: #ffea00;
          font-size: 14px;
          cursor: pointer;
          pointer-events: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          box-shadow: 0 0 10px rgba(255, 234, 0, 0.2);
          margin-bottom: -30px;
        }
        .reset-btn:active {
          transform: scale(0.9);
          background: #ffea00;
          color: #000;
        }
      `}</style>

      {/* LEFT: DRIVE */}
      <div ref={leftZoneRef} className="j-zone">
        <div className="j-label" style={{ color: "#00f2ff" }}>
          DRIVE
        </div>
      </div>

      {/* CENTER: RESET */}
      <button
        className="reset-btn"
        onClick={() => onReset && onReset()}
        title="Reset Camera"
      >
        RST
      </button>

      {/* RIGHT: CAMERA */}
      <div ref={rightZoneRef} className="j-zone">
        <div className="j-label" style={{ color: "#ffea00" }}>
          GIMBAL
        </div>
      </div>
    </div>
  );
};
