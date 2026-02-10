import React, { useState, useEffect, useCallback, useRef } from "react";

export const ControlCluster = ({ onDrive }) => {
  const [activeKeys, setActiveKeys] = useState(new Set());
  const prevKeysRef = useRef("");

  const controlMap = [
    { key: null, label: "" },
    { key: "w", label: "W" },
    { key: null, label: "" },
    { key: "a", label: "A" },
    { key: "s", label: "S" },
    { key: "d", label: "D" },
  ];

  // 1. Refined sync function
  const syncState = useCallback(
    (nextKeys) => {
      const keysArray = Array.from(nextKeys).sort();
      const keysString = keysArray.join("");

      if (keysString !== prevKeysRef.current) {
        onDrive(keysArray);
        prevKeysRef.current = keysString;
      }
    },
    [onDrive],
  );

  // 2. Direct State Updates
  const startAction = useCallback(
    (key) => {
      setActiveKeys((prev) => {
        const next = new Set(prev).add(key);
        syncState(next);
        return next;
      });
    },
    [syncState],
  );

  const stopAction = useCallback(
    (key) => {
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        syncState(next);
        return next;
      });
    },
    [syncState],
  );

  // 3. Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key) && !activeKeys.has(key)) {
        startAction(key);
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        stopAction(key);
      }
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
          grid-template-columns: repeat(3, 45px); /* Reduced from 60px */
          gap: 5px; 
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .control-btn {
          width: 45px; height: 45px; background: rgba(0, 0, 0, 0.7); color: #00f2ff;
          border: 1px solid #00f2ff; border-radius: 6px; cursor: pointer; font-weight: bold;
          transition: all 0.1s ease; display: flex; align-items: center; justify-content: center;
          touch-action: none; /* Prevents browser handling touch gestures */
        }
        .control-btn.active {
          background: #00f2ff; color: #000; box-shadow: 0 0 15px #00f2ff; transform: scale(0.92);
        }
      `}</style>

      <div className="wasd-controls">
        {controlMap.map((item, index) =>
          item.label === "" ? (
            <div key={index} />
          ) : (
            <button
              key={index}
              className={`control-btn ${activeKeys.has(item.key) ? "active" : ""}`}
              onMouseDown={() => startAction(item.key)}
              onMouseUp={() => stopAction(item.key)}
              onMouseLeave={() => stopAction(item.key)}
              onTouchStart={(e) => {
                e.preventDefault();
                startAction(item.key);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopAction(item.key);
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
};
