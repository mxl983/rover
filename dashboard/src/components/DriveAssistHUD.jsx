import React from "react";

/**
 * @param {number} tilt - (0-180, 90 center)
 */
export const DriveAssistHUD = ({ tilt = 90 }) => {
  const green = "#00f2ff";

  // Vertical displacement (5 pixels per degree)
  const ladderYOffset = (90 - tilt) * 5;

  // Generate a wider range of rungs to see the fading effect
  const rungs = [-40, -30, -20, -10, 0, 10, 20, 30, 40];

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        color: green,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <svg viewBox="0 0 400 300" style={{ width: "100%", height: "100%" }}>
        <g
          style={{
            transform: `translateY(${ladderYOffset}px)`,
            transition: "transform 0.12s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {rungs.map((pitch) => {
            const yPos = 150 - pitch * 5;
            const isPos = pitch > 0;
            const isHorizon = pitch === 0;

            // DYNAMIC OPACITY LOGIC:
            // Calculate distance of this rung from the screen center (150)
            // after the ladder translation is applied.
            const distanceFromCenter = Math.abs(yPos + ladderYOffset - 150);

            // Max brightness at center, fades to 0 over 100 pixels
            const opacity = Math.max(0, 0.8 - distanceFromCenter / 120);
            const strokeWidth = Math.max(0.3, 0.8 - distanceFromCenter / 200);

            return (
              <g key={pitch} style={{ opacity, transition: "opacity 0.1s" }}>
                {isHorizon ? (
                  /* Horizon Line - Solid but focused */
                  <g>
                    <line
                      x1="130"
                      y1="150"
                      x2="180"
                      y2="150"
                      stroke={green}
                      strokeWidth={strokeWidth + 0.2}
                    />
                    <line
                      x1="220"
                      y1="150"
                      x2="270"
                      y2="150"
                      stroke={green}
                      strokeWidth={strokeWidth + 0.2}
                    />
                    <text
                      x="115"
                      y="153"
                      fill={green}
                      fontSize="8"
                      fontWeight="400"
                    >
                      00
                    </text>
                    <text
                      x="275"
                      y="153"
                      fill={green}
                      fontSize="8"
                      fontWeight="400"
                    >
                      00
                    </text>
                  </g>
                ) : (
                  /* Standard Pitch Rungs */
                  <g>
                    <line
                      x1="145"
                      y1={yPos}
                      x2="180"
                      y2={yPos}
                      stroke={green}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isPos ? "" : "2, 3"}
                    />
                    <line
                      x1="145"
                      y1={yPos}
                      x2="145"
                      y2={yPos + (isPos ? 4 : -4)}
                      stroke={green}
                      strokeWidth={strokeWidth}
                    />

                    <line
                      x1="220"
                      y1={yPos}
                      x2="255"
                      y2={yPos}
                      stroke={green}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isPos ? "" : "2, 3"}
                    />
                    <line
                      x1="255"
                      y1={yPos}
                      x2="255"
                      y2={yPos + (isPos ? 4 : -4)}
                      stroke={green}
                      strokeWidth={strokeWidth}
                    />

                    <text
                      x="134"
                      y={yPos + 3}
                      fill={green}
                      fontSize="6"
                      fontWeight="200"
                    >
                      {Math.abs(pitch)}
                    </text>
                    <text
                      x="258"
                      y={yPos + 3}
                      fill={green}
                      fontSize="6"
                      fontWeight="200"
                    >
                      {Math.abs(pitch)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* --- FIXED CENTRAL FOCUS POINT --- */}
        <g stroke={green} strokeWidth="1" opacity="0.9">
          <circle cx="200" cy="150" r="1.5" fill={green} />
          {/* Subtle brackets that don't fade */}
          <path d="M 190 148 V 152 M 210 148 V 152" fill="none" opacity="0.5" />
        </g>
      </svg>
    </div>
  );
};
