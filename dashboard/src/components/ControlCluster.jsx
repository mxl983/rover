import React, { useState, useEffect, useCallback, useRef } from "react";

export const ControlCluster = ({ onDrive }) => {
  const [activeKeys, setActiveKeys] = useState(new Set());
  // Use a ref to track the previous state to avoid redundant network calls
  const prevKeysRef = useRef("");

  const controlMap = [
    { key: null, label: "" },
    { key: "w", label: "W" },
    { key: null, label: "" },
    { key: "a", label: "A" },
    { key: "s", label: "S" },
    { key: "d", label: "D" },
  ];

  // Unified function to sync state to the backend
  const syncState = useCallback(
    (nextKeys) => {
      const keysArray = Array.from(nextKeys).sort();
      const keysString = keysArray.join("");

      // Only send if the combination of keys has actually changed
      if (keysString !== prevKeysRef.current) {
        onDrive(keysArray);
        prevKeysRef.current = keysString;
      }
    },
    [onDrive],
  );

  const handleKeyDown = useCallback(
    (e) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        setActiveKeys((prev) => {
          const next = new Set(prev).add(key);
          syncState(next);
          return next;
        });
      }
    },
    [syncState],
  );

  const handleKeyUp = useCallback(
    (e) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        setActiveKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          syncState(next);
          return next;
        });
      }
    },
    [syncState],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div className="control-cluster">
      <style>{`
        .wasd-controls { display: grid; grid-template-columns: repeat(3, 45px); gap: 5px; }
        .control-btn {
          width: 45px; height: 45px; background: rgba(0, 0, 0, 0.6); color: #00f2ff;
          border: 1px solid #00f2ff; border-radius: 4px; cursor: pointer; font-weight: bold;
          transition: all 0.1s ease; display: flex; align-items: center; justify-content: center;
        }
        .control-btn.active {
          background: #00f2ff; color: #000; box-shadow: 0 0 20px #00f2ff; transform: scale(0.95);
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
              onMouseDown={() => {
                const next = new Set(activeKeys).add(item.key);
                setActiveKeys(next);
                syncState(next);
              }}
              onMouseUp={() => {
                const next = new Set(activeKeys);
                next.delete(item.key);
                setActiveKeys(next);
                syncState(next);
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
