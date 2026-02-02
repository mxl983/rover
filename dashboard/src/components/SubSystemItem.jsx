import React from "react";

/**
 * SubsystemItem Component
 * @param {string} label - The name of the subsystem (e.g., "CAM_UNIT")
 * @param {string} status - Current status text (e.g., "OFFLINE" or "ONLINE")
 * @param {string} dotColor - The class name for the dot color ('red', 'green', or 'yellow')
 * @param {string} statusColor - Hex code or CSS color for the status text
 */
export const SubsystemItem = ({ label, status, dotColor, statusColor }) => {
  return (
    <div className="subsystem-item">
      {/* Dynamic class for the status dot */}
      <span className={`dot ${dotColor}`}></span>
      <div
        style={{
          fontSize: "10px",
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {label} <span style={{ color: statusColor }}>{status}</span>
      </div>
    </div>
  );
};

export default SubsystemItem;
