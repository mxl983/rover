import React from "react";

/**
 * RoverSchematic Component
 * @param {number} pan - The horizontal rotation in degrees (e.g., -90 to 90)
 * @param {number} tilt - The vertical pitch in degrees (e.g., -45 to 45)
 */
export const RoverSchematic = ({ pan = 0, tilt = 0 }) => {
  // Constants for styling
  const cyan = "#00f2ff";

  // Calculate tilt visual effect
  // As tilt increases, we shorten the "cone" to simulate looking down/up
  const tiltFactor = Math.cos((tilt * Math.PI) / 180);
  const coneOpacity = 0.4 * (1 - Math.abs(tilt) / 100);

  return (
    <div
      style={{
        height: "100px",
        display: "flex",
        alignItems: "center",
        paddingTop: "10px",
        gap: "40px",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        style={{
          width: "100%",
          height: "100%",
          overflow: "visible",
          filter: `drop-shadow(0 0 4px ${cyan})`,
        }}
      >
        <defs>
          <linearGradient id="viewFade" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={cyan} stopOpacity="0" />
            <stop offset="100%" stopColor={cyan} stopOpacity={coneOpacity} />
          </linearGradient>
        </defs>

        {/* Rover Chassis */}
        <rect
          x="35"
          y="35"
          width="30"
          height="45"
          fill="none"
          stroke={cyan}
          strokeWidth="2"
        />

        {/* Wheels - Left */}
        <rect x="30" y="40" width="5" height="12" fill={cyan} />
        <rect x="30" y="63" width="5" height="12" fill={cyan} />

        {/* Wheels - Right */}
        <rect x="65" y="40" width="5" height="12" fill={cyan} />
        <rect x="65" y="63" width="5" height="12" fill={cyan} />

        {/* Camera Assembly Group */}
        <g
          style={{
            transform: `rotate(${pan}deg)`,
            transformOrigin: "50px 45px",
            transition: "transform 0.2s ease-out",
          }}
        >
          {/* Field of View Cone (Affected by Tilt) */}
          <path
            d={`M50 45 L${50 - 25} ${45 - 35 * tiltFactor} L${50 + 25} ${45 - 35 * tiltFactor} Z`}
            fill="url(#viewFade)"
            stroke="none"
          />

          {/* Lens Horizon Line */}
          <line
            x1={50 - 25}
            y1={45 - 35 * tiltFactor}
            x2={50 + 25}
            y2={45 - 35 * tiltFactor}
            stroke={cyan}
            strokeWidth="1"
            opacity="0.5"
          />

          {/* Camera Pivot Point */}
          <circle cx="50" cy="45" r="3" fill={cyan} />
        </g>
      </svg>
    </div>
  );
};
