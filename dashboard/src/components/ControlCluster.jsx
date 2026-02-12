import React, { useState, useEffect, useCallback, useRef } from "react";
// If you have lucide-react installed, uncomment the next line:
import { Lightbulb, LightbulbOff } from "lucide-react";

export const ControlCluster = ({ onDrive, onLightToggle, usbPower }) => {
  const [activeKeys, setActiveKeys] = useState(new Set());
  const prevKeysRef = useRef("");
  const isLightOn = usbPower === "on";

  const controlMap = [
    { key: null, label: "" },
    { key: "w", label: "W" },
    { key: null, label: "" },
    { key: null, label: "" },
    { key: "a", label: "A" },
    { key: "s", label: "S" },
    { key: "d", label: "D" },
    { key: "f", label: "F", type: "toggle" },
  ];

  const syncState = useCallback(
    (nextKeys) => {
      const movementKeys = Array.from(nextKeys)
        .filter((k) => k !== "f")
        .sort();
      const keysString = movementKeys.join("");
      if (keysString !== prevKeysRef.current) {
        onDrive(movementKeys);
        prevKeysRef.current = keysString;
      }
    },
    [onDrive],
  );

  const startAction = useCallback(
    (key) => {
      if (key === "f") {
        onLightToggle();
        return;
      }
      setActiveKeys((prev) => {
        const next = new Set(prev).add(key);
        syncState(next);
        return next;
      });
    },
    [syncState, onLightToggle],
  );

  const stopAction = useCallback(
    (key) => {
      if (key === "f") return;
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        syncState(next);
        return next;
      });
    },
    [syncState],
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "f"].includes(key) && !activeKeys.has(key)) {
        startAction(key);
      }
    };
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) stopAction(key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeKeys, startAction, stopAction]);

  return (
    <div className="control-cluster">
      <style>{`
        .wasd-controls { 
          display: grid; 
          grid-template-columns: repeat(4, 45px); 
          gap: 5px; 
          user-select: none;
        }
        .control-btn {
          width: 45px; height: 45px; background: rgba(0, 0, 0, 0.7); color: #00f2ff;
          border: 1px solid #00f2ff; border-radius: 6px; cursor: pointer; font-weight: bold;
          transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; justify-content: center;
          touch-action: none; font-size: 14px;
        }
        .control-btn.active {
          background: #00f2ff; color: #000; box-shadow: 0 0 15px #00f2ff; transform: scale(0.92);
        }
        /* Glowing Yellow for the Light */
        .control-btn.light-active {
          background: #ffea00; color: #000; border-color: #fff;
          box-shadow: 0 0 20px #ffea00, inset 0 0 10px rgba(255,255,255,0.8);
        }
        .key-hint { font-size: 9px; opacity: 0.6; margin-top: -2px; }
      `}</style>

      <div className="wasd-controls">
        {controlMap.map((item, index) =>
          item.label === "" ? (
            <div key={index} />
          ) : (
            <button
              key={index}
              className={`control-btn ${
                item.key === "f" && isLightOn
                  ? "light-active"
                  : activeKeys.has(item.key)
                    ? "active"
                    : ""
              }`}
              onMouseDown={() => startAction(item.key)}
              onMouseUp={() => stopAction(item.key)}
              onTouchStart={(e) => {
                e.preventDefault();
                startAction(item.key);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopAction(item.key);
              }}
            >
              {/* If key is F, show Bulb icon, else show Label */}
              {item.key === "f" ? (
                <div style={{ display: "flex", flexDirection: "row" }}>
                  <span style={{ fontSize: "18px" }}>
                    {isLightOn ? "💡" : "outline" === "outline" ? "💡" : "💡"}
                  </span>
                  <span className="key-hint">F</span>
                </div>
              ) : (
                item.label
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
};
