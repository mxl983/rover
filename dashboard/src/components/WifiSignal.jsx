import React from "react";

export const WifiSignal = ({ dbm }) => {
  // 1. Convert dBm to a strength level (0 to 4)
  const getLevel = (val) => {
    if (val > -55) return 4; // Excellent
    if (val > -65) return 3; // Good
    if (val > -75) return 2; // Fair
    if (val > -85) return 1; // Weak
    return 0; // Unusable
  };

  const level = getLevel(dbm);

  // 2. Determine color based on strength
  const getColor = (lvl) => {
    if (lvl >= 3) return "#4caf50"; // Green
    if (lvl === 2) return "#ffeb3b"; // Yellow
    if (lvl === 1) return "#ff9800"; // Orange
    return "#f44336"; // Red
  };

  const activeColor = getColor(level);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "2px",
          height: "20px",
        }}
      >
        {[1, 2, 3, 4].map((bar) => (
          <div
            key={bar}
            style={{
              width: "4px",
              height: `${bar * 25}%`,
              backgroundColor: bar <= level ? activeColor : "#333",
              borderRadius: "1px",
              transition: "background-color 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default WifiSignal;
