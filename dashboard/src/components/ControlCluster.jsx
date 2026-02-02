import React, { useState, useEffect, useCallback } from "react";

/**
 * ControlCluster Component
 * @param {Function} onDrive - Callback when a direction is triggered (e.g., 'W', 'A', 'S', 'D')
 * @param {Function} onStop - Callback when movement should stop
 */
export const ControlCluster = ({ onDrive, onStop }) => {
  const [activeKeys, setActiveKeys] = useState(new Set());

  // Map keys to their display labels
  const controlMap = [
    { key: null, label: "" },
    { key: "w", label: "W" },
    { key: null, label: "" },
    { key: "a", label: "A" },
    { key: "s", label: "S" },
    { key: "d", label: "D" },
  ];

  const handleKeyDown = useCallback(
    (e) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        setActiveKeys((prev) => new Set(prev).add(key));
        onDrive(key.toUpperCase());
      }
    },
    [onDrive],
  );

  const handleKeyUp = useCallback(
    (e) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        setActiveKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        onStop();
      }
    },
    [onStop],
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
        .wasd-controls {
          display: grid;
          grid-template-columns: repeat(3, 45px);
          gap: 5px;
        }
        .control-btn {
          width: 45px;
          height: 45px;
          background: rgba(0, 0, 0, 0.6);
          color: #00f2ff;
          border: 1px solid #00f2ff;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.1s ease;
          outline: none;
          display: flex;
          align-items: center;
          justify-content: center;
          text-transform: uppercase;
        }
        .control-btn.active {
          background: #00f2ff;
          color: #000;
          box-shadow: 0 0 30px #00f2ff, 0 0 10px #fff;
          transform: scale(0.95);
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
                setActiveKeys((prev) => new Set(prev).add(item.key));
                onDrive(item.label);
              }}
              onMouseUp={() => {
                setActiveKeys((prev) => {
                  const next = new Set(prev);
                  next.delete(item.key);
                  return next;
                });
                onStop();
              }}
              onMouseLeave={() => {
                if (activeKeys.has(item.key)) {
                  setActiveKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(item.key);
                    return next;
                  });
                  onStop();
                }
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
