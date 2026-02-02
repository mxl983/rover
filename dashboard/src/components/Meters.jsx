import React from "react";
import { RoverSchematic } from "./RoverSchematic";

export const Meters = ({ stats }) => {
  console.log(stats);
  return (
    <div className="meter-container">
      <RoverSchematic />
      <div className="meter-row">
        <div className="stat">
          BAT <span>98%</span>
        </div>
        <div className="stat">
          VOL <span>12.4V</span>
        </div>
        <div className="stat">
          DLAY <span id="lat">{stats.latency || "-"}ms</span>
        </div>
      </div>
      <div className="meter-row">
        <div className="stat">
          DIST <span>20M</span>
        </div>
        <div className="stat">
          TEMP <span>{stats.cpuTemp || "-"}</span>
        </div>
        <div className="stat">
          CPU <span id="lat">{stats.cpuLoad || "-"}%</span>
        </div>
      </div>
    </div>
  );
};

export default Meters;
