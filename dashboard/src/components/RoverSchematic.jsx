import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { Battery, BatteryCharging, Thermometer, Activity } from "lucide-react";

const TOUCH_TARGET_MIN = 44;
const SIZE = 88;
const CENTER = SIZE / 2;
const R_BATTERY = 34;
const R_CPU = 26;
const R_LAT = 18;

const palette = {
  green: "#00f2ff",
  yellow: "#ffd60a",
  red: "#ff453a",
  blue: "#0a84ff",
  grey: "#636366",
  track: "rgba(255,255,255,0.18)",
  text: "rgba(255,255,255,0.9)",
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function bandColor(value, { good, warn }, invert = false) {
  if (value == null) return palette.grey;
  if (invert) {
    if (value >= good) return palette.green;
    if (value >= warn) return palette.yellow;
    return palette.red;
  } else {
    if (value <= good) return palette.green;
    if (value <= warn) return palette.yellow;
    return palette.red;
  }
}

export const RoverSchematic = ({
  pan = 90,
  battery = null,
  cpuTemp = null,
  latencyMs = null,
  isOffline = false,
  isCharging = false,
  handleClick = () => {},
}) => {
  const hasBatteryData = battery !== null && battery !== undefined;
  const chargeLevel = hasBatteryData ? Math.min(Math.max(battery, 0), 100) : 0;

  const batteryFrac = hasBatteryData ? clamp01(chargeLevel / 100) : 0;
  const cpuFrac =
    cpuTemp == null ? 0 : clamp01(Math.min(Math.max(cpuTemp, 0), 100) / 100);
  const latencyFrac =
    latencyMs == null ? 0 : clamp01(Math.min(Math.max(latencyMs, 0), 400) / 400);

  const circBattery = 2 * Math.PI * R_BATTERY;
  const circCpu = 2 * Math.PI * R_CPU;
  const circLat = 2 * Math.PI * R_LAT;

  const batteryDash = circBattery * batteryFrac;
  const cpuDash = circCpu * cpuFrac;
  const latencyDash = circLat * latencyFrac;

  const batteryColor = isOffline
    ? palette.grey
    : bandColor(chargeLevel, { good: 60, warn: 30 }, true);
    
  const cpuColor = isOffline
    ? palette.grey
    : bandColor(cpuTemp, { good: 60, warn: 75 });
    
  const latencyColor = isOffline
    ? palette.grey
    : bandColor(latencyMs, { good: 80, warn: 200 });

  const labelParts = [];
  if (hasBatteryData) labelParts.push(`battery ${Math.round(chargeLevel)}%`);
  if (cpuTemp != null) labelParts.push(`CPU ${Math.round(cpuTemp)}°C`);
  if (latencyMs != null) labelParts.push(`latency ${Math.round(latencyMs)}ms`);
  if (pan != null) labelParts.push(`pan ${Math.round(pan)}°`);
  labelParts.push(isOffline ? "offline" : "online");
  if (isCharging && !isOffline) labelParts.push("charging");

  const onClick = useCallback(
    (e) => {
      e.stopPropagation();
      handleClick();
    },
    [handleClick],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${labelParts.join(", ")}. Tap to expand.`}
      style={{
        width: SIZE,
        height: SIZE,
        minWidth: TOUCH_TARGET_MIN,
        minHeight: TOUCH_TARGET_MIN,
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
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <defs>
          <filter
            id="rover-soft-shadow"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.18" />
          </filter>
        </defs>

        <style>{`
          @media (prefers-reduced-motion: reduce) {
            .rover-schematic-rotate { animation: none !important; }
          }
        `}</style>

        {/* Background disc */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_BATTERY + 4}
          fill="rgba(0,0,0,0.55)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          filter="url(#rover-soft-shadow)"
        />

        {/* Ring tracks */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_BATTERY}
          stroke={palette.track}
          strokeWidth={3}
          fill="none"
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_CPU}
          stroke={palette.track}
          strokeWidth={3}
          fill="none"
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_LAT}
          stroke={palette.track}
          strokeWidth={3}
          fill="none"
        />

        {/* Battery ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_BATTERY}
          stroke={batteryColor}
          strokeWidth={3}
          fill="none"
          strokeDasharray={`${batteryDash} ${circBattery - batteryDash}`}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          strokeLinecap="round"
        />

        {/* CPU ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_CPU}
          stroke={cpuColor}
          strokeWidth={3}
          fill="none"
          strokeDasharray={`${cpuDash} ${circCpu - cpuDash}`}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          strokeLinecap="round"
        />

        {/* Latency ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_LAT}
          stroke={latencyColor}
          strokeWidth={3}
          fill="none"
          strokeDasharray={`${latencyDash} ${circLat - latencyDash}`}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          strokeLinecap="round"
        />

        {/* Pan angle indicator: small tick around outer ring */}
        {pan != null && !Number.isNaN(pan) && (
          (() => {
            const raw = ((pan - 180) * Math.PI) / 180;
            const panRad = Math.PI - raw;
            const rInner = R_BATTERY + 2;
            const rOuter = R_BATTERY + 7;
            const x1 = CENTER + rInner * Math.cos(panRad);
            const y1 = CENTER + rInner * Math.sin(panRad);
            const x2 = CENTER + rOuter * Math.cos(panRad);
            const y2 = CENTER + rOuter * Math.sin(panRad);
            const color = isOffline ? palette.grey : palette.green;
            return (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })()
        )}

        {/* Metrics Group */}
        <g 
          fill={palette.text} 
          style={{ 
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif" 
          }}
        >
          {/* Battery Row */}
          {isCharging && !isOffline ? (
             <BatteryCharging x={CENTER - 11} y={CENTER - 11} size={6} color={palette.green} strokeWidth={2.5} />
          ) : (
             <Battery x={CENTER - 11} y={CENTER - 11} size={6} color={palette.text} strokeWidth={2.5} />
          )}
          <text x={CENTER - 3} y={CENTER - 6} fontSize={5.5} textAnchor="start">
            {hasBatteryData ? `${Math.round(chargeLevel)}%` : isOffline ? "--" : "…"}
          </text>

          {/* CPU Row */}
          <Thermometer x={CENTER - 11} y={CENTER - 3} size={6} color={palette.text} strokeWidth={2.5} />
          <text x={CENTER - 3} y={CENTER + 2} fontSize={5.5} textAnchor="start">
            {cpuTemp != null ? `${Math.round(cpuTemp)}°` : isOffline ? "--" : "…"}
          </text>

          {/* Latency Row */}
          <Activity x={CENTER - 11} y={CENTER + 5} size={6} color={palette.text} strokeWidth={2.5} />
          <text x={CENTER - 3} y={CENTER + 10} fontSize={5.5} textAnchor="start">
            {latencyMs != null ? `${Math.round(latencyMs)}ms` : isOffline ? "--" : "…"}
          </text>
        </g>
      </svg>
    </div>
  );
};

RoverSchematic.propTypes = {
  pan: PropTypes.number,
  battery: PropTypes.number,
  cpuTemp: PropTypes.number,
  latencyMs: PropTypes.number,
  isOffline: PropTypes.bool,
  isCharging: PropTypes.bool,
  handleClick: PropTypes.func,
};