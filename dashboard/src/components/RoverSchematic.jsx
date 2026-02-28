import React from "react";

export const RoverSchematic = ({
  pan = 90,
  battery = null,
  isOffline = false,
  handleClick = () => {},
}) => {
  const cyan = "#00f2ff";
  const offlineRed = "#ff3333";

  const mainColor = isOffline ? offlineRed : cyan;
  const rotationAngle = pan - 90;

  // Battery Logic
  const hasBatteryData = battery !== null && battery !== undefined;
  const chargeLevel = hasBatteryData ? Math.min(Math.max(battery, 0), 100) : 0;
  const fillHeight = (chargeLevel / 100) * 36;

  return (
    <div
      style={{
        height: "100px",
        width: "100px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
        pointerEvents: "auto",
        zIndex: 10,
      }}
      onClick={(e) => {
        e.stopPropagation();
        handleClick();
      }}
    >
      <svg
        viewBox="0 0 100 100"
        style={{
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <defs>
          {/* Gradient for the Camera Cone */}
          <linearGradient id="coneGradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={cyan} stopOpacity="0" />
            <stop offset="100%" stopColor={cyan} stopOpacity="0.5" />
          </linearGradient>
        </defs>

        <style>
          {`
            @keyframes pulseRed {
              0% { opacity: 1; }
              50% { opacity: 0.4; }
              100% { opacity: 1; }
            }
            .offline-pulse {
              animation: pulseRed 2s infinite ease-in-out;
            }
          `}
        </style>

        {/* Wheels */}
        <g opacity={isOffline ? "0.2" : "0.6"}>
          <rect x="30" y="40" width="5" height="12" fill={mainColor} rx="1" />
          <rect x="30" y="63" width="5" height="12" fill={mainColor} rx="1" />
          <rect x="65" y="40" width="5" height="12" fill={mainColor} rx="1" />
          <rect x="65" y="63" width="5" height="12" fill={mainColor} rx="1" />
        </g>

        {/* Battery Chassis */}
        <rect
          x="35"
          y="40"
          width="30"
          height="40"
          rx="4"
          fill="rgba(0,0,0,0.6)"
          stroke={mainColor}
          strokeWidth="2"
        />
        <rect x="45" y="37" width="10" height="3" rx="1" fill={mainColor} />

        {/* Liquid Fill Logic */}
        {hasBatteryData && (
          <g>
            <path
              fill={mainColor}
              d={`M 37, 78 L 63, 78 L 63, ${78 - fillHeight} Q 50, ${78 - fillHeight - 3} 37, ${78 - fillHeight} Z`}
            >
              {!isOffline && chargeLevel > 0 && (
                <animate
                  attributeName="d"
                  dur="2s"
                  repeatCount="indefinite"
                  values={`
                    M 37, 78 L 63, 78 L 63, ${78 - fillHeight} Q 40, ${78 - fillHeight - 4} 37, ${78 - fillHeight} Z;
                    M 37, 78 L 63, 78 L 63, ${78 - fillHeight} Q 50, ${78 - fillHeight - 1} 37, ${78 - fillHeight} Z;
                    M 37, 78 L 63, 78 L 63, ${78 - fillHeight} Q 60, ${78 - fillHeight - 4} 37, ${78 - fillHeight} Z;
                    M 37, 78 L 63, 78 L 63, ${78 - fillHeight} Q 50, ${78 - fillHeight - 1} 37, ${78 - fillHeight} Z;
                    M 37, 78 L 63, 78 L 63, ${78 - fillHeight} Q 40, ${78 - fillHeight - 4} 37, ${78 - fillHeight} Z;
                  `}
                />
              )}
            </path>
            <text
              x="50"
              y="62"
              textAnchor="middle"
              fill="#fff"
              fontSize="10"
              fontWeight="bold"
              style={{
                fontFamily: "monospace",
                textShadow: "1px 1px 1px #000",
              }}
            >
              {Math.round(chargeLevel)}%
            </text>
          </g>
        )}

        {/* Camera Cone (Online) vs WiFi Icon (Offline) */}
        {!isOffline ? (
          <g
            transform={`rotate(${-rotationAngle}, 50, 45)`}
            style={{ transition: "transform 0.15s linear" }}
          >
            <path
              d="M50 45 L25 15 L75 15 Z"
              fill="url(#coneGradient)"
              stroke="none"
            />
            {/* Solid Horizon Line at the end of view */}
            <line
              x1="25"
              y1="15"
              x2="75"
              y2="15"
              stroke={cyan}
              strokeWidth="1.5"
              opacity="0.8"
            />
            <circle
              cx="50"
              cy="45"
              r="3"
              fill={cyan}
              stroke="#000"
              strokeWidth="1"
            />
          </g>
        ) : (
          <g
            className="offline-pulse"
            transform="translate(50, 22)"
            stroke={offlineRed}
            strokeWidth="1.5"
            fill="none"
          >
            <path d="M-8 -2 Q 0 -10 8 -2" />
            <path d="M-5 1 Q 0 -4 5 1" />
            <circle cx="0" cy="5" r="1.5" fill={offlineRed} stroke="none" />
            <line
              x1="-10"
              y1="8"
              x2="10"
              y2="-8"
              stroke={offlineRed}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
