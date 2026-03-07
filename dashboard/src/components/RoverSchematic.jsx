import React, { useCallback } from "react";
import PropTypes from "prop-types";

const TOUCH_TARGET_MIN = 44;
const VISUAL_SIZE = 100;
const CORNER_RADIUS = 12;

const colors = {
  online: {
    primary: "rgba(0, 122, 255, 0.95)",
    primaryDim: "rgba(0, 122, 255, 0.4)",
    coneGradient: ["rgba(0, 122, 255, 0)", "rgba(0, 122, 255, 0.35)"],
    stroke: "rgba(255, 255, 255, 0.25)",
    text: "rgba(255, 255, 255, 0.95)",
  },
  offline: {
    primary: "rgba(255, 59, 48, 0.95)",
    primaryDim: "rgba(255, 59, 48, 0.35)",
    stroke: "rgba(255, 255, 255, 0.15)",
    text: "rgba(255, 255, 255, 0.9)",
  },
};

export const RoverSchematic = ({
  pan = 90,
  battery = null,
  isOffline = false,
  handleClick = () => {},
}) => {
  const theme = isOffline ? colors.offline : colors.online;
  const rotationAngle = pan - 90;

  const hasBatteryData = battery !== null && battery !== undefined;
  const chargeLevel = hasBatteryData ? Math.min(Math.max(battery, 0), 100) : 0;
  const fillHeight = (chargeLevel / 100) * 36;

  const onClick = useCallback(
    (e) => {
      e.stopPropagation();
      handleClick();
    },
    [handleClick],
  );

  const padding = Math.max(0, (TOUCH_TARGET_MIN - VISUAL_SIZE) / 2);
  const totalSize = VISUAL_SIZE + padding * 2;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={
        isOffline
          ? "Rover offline. Tap to expand metrics."
          : `Rover status, battery ${hasBatteryData ? Math.round(chargeLevel) : "?"}%. Tap to expand.`
      }
      className="rover-schematic-card"
      style={{
        width: totalSize,
        height: totalSize,
        minWidth: TOUCH_TARGET_MIN,
        minHeight: TOUCH_TARGET_MIN,
        padding,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
        pointerEvents: "auto",
        zIndex: 10,
        touchAction: "manipulation",
      }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div
        className="rover-schematic-inner"
        style={{
          width: VISUAL_SIZE,
          height: VISUAL_SIZE,
          borderRadius: CORNER_RADIUS,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 12px rgba(0,0,0,0.25)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          transition: "transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)",
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
          aria-hidden
        >
          <defs>
            <linearGradient
              id="rover-cone-gradient"
              x1="0%"
              y1="100%"
              x2="0%"
              y2="0%"
            >
              <stop offset="0%" stopColor={theme.primary} stopOpacity="0" />
              <stop offset="100%" stopColor={theme.primary} stopOpacity="0.4" />
            </linearGradient>
            <filter id="rover-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.2" />
            </filter>
          </defs>

          <style>{`
            @media (prefers-reduced-motion: reduce) {
              .rover-schematic-rotate,
              .rover-schematic-pulse { animation: none !important; }
            }
            .rover-schematic-pulse {
              animation: rover-pulse 2s ease-in-out infinite;
            }
            @keyframes rover-pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.45; }
            }
          `}</style>

          {/* Wheels */}
          <g opacity={isOffline ? 0.25 : 0.5} filter="url(#rover-soft-shadow)">
            {[
              [30, 40],
              [30, 63],
              [65, 40],
              [65, 63],
            ].map(([x, y], i) => (
              <rect
                key={i}
                x={x}
                y={y}
                width={5}
                height={12}
                rx={1.5}
                fill={theme.primary}
              />
            ))}
          </g>

          {/* Battery chassis */}
          <rect
            x={35}
            y={40}
            width={30}
            height={40}
            rx={5}
            fill="rgba(0, 0, 0, 0.35)"
            stroke={theme.primary}
            strokeWidth={1.5}
            opacity={0.9}
          />
          <rect
            x={45}
            y={36.5}
            width={10}
            height={4}
            rx={1.5}
            fill={theme.primary}
          />

          {/* Battery fill */}
          {hasBatteryData && (
            <g>
              <path
                fill={theme.primary}
                fillOpacity={isOffline ? 0.6 : 0.85}
                d={`M 37.5 77.5 L 62.5 77.5 L 62.5 ${77.5 - fillHeight} Q 50 ${77.5 - fillHeight - 4} 37.5 ${77.5 - fillHeight} Z`}
              >
                {!isOffline && chargeLevel > 0 && (
                  <animate
                    attributeName="d"
                    dur="2.5s"
                    repeatCount="indefinite"
                    values={`
                      M 37.5 77.5 L 62.5 77.5 L 62.5 ${77.5 - fillHeight} Q 40 ${77.5 - fillHeight - 5} 37.5 ${77.5 - fillHeight} Z;
                      M 37.5 77.5 L 62.5 77.5 L 62.5 ${77.5 - fillHeight} Q 50 ${77.5 - fillHeight - 2} 37.5 ${77.5 - fillHeight} Z;
                      M 37.5 77.5 L 62.5 77.5 L 62.5 ${77.5 - fillHeight} Q 60 ${77.5 - fillHeight - 5} 37.5 ${77.5 - fillHeight} Z;
                      M 37.5 77.5 L 62.5 77.5 L 62.5 ${77.5 - fillHeight} Q 50 ${77.5 - fillHeight - 2} 37.5 ${77.5 - fillHeight} Z;
                      M 37.5 77.5 L 62.5 77.5 L 62.5 ${77.5 - fillHeight} Q 40 ${77.5 - fillHeight - 5} 37.5 ${77.5 - fillHeight} Z;
                    `}
                  />
                )}
              </path>
              <text
                x={50}
                y={61.5}
                textAnchor="middle"
                fill={theme.text}
                fontSize={10}
                fontWeight={600}
                style={{
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
                  textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                }}
              >
                {Math.round(chargeLevel)}%
              </text>
            </g>
          )}

          {/* Camera cone (online) / Offline icon */}
          {!isOffline ? (
            <g
              className="rover-schematic-rotate"
              transform={`rotate(${-rotationAngle}, 50, 45)`}
              style={{
                transition: "transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)",
              }}
            >
              <path
                d="M50 45 L25 15 L75 15 Z"
                fill="url(#rover-cone-gradient)"
                stroke="none"
              />
              <line
                x1={25}
                y1={15}
                x2={75}
                y2={15}
                stroke={theme.primary}
                strokeWidth={1.5}
                strokeOpacity={0.85}
              />
              <circle
                cx={50}
                cy={45}
                r={3}
                fill={theme.primary}
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={0.8}
              />
            </g>
          ) : (
            <g
              className="rover-schematic-pulse"
              transform="translate(50, 22)"
              stroke={theme.primary}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
            >
              <path d="M-8 -2 Q 0 -10 8 -2" />
              <path d="M-5 1 Q 0 -4 5 1" />
              <circle cx={0} cy={5} r={1.5} fill={theme.primary} stroke="none" />
              <line x1={-10} y1={8} x2={10} y2={-8} strokeWidth={2} />
            </g>
          )}
        </svg>
      </div>

      <style>{`
        .rover-schematic-card:focus-visible .rover-schematic-inner {
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08),
            0 0 0 2px rgba(0, 122, 255, 0.5),
            0 4px 12px rgba(0,0,0,0.25);
        }
        .rover-schematic-card:active .rover-schematic-inner {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  );
};

RoverSchematic.propTypes = {
  pan: PropTypes.number,
  battery: PropTypes.number,
  isOffline: PropTypes.bool,
  handleClick: PropTypes.func,
};
