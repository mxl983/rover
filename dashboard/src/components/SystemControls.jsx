import React from "react";
import { Power, RefreshCw, Moon, Sun, Settings, Focus } from "lucide-react";

export const SystemControls = ({
  isPowered,
  nvActive,
  resMode,
  focusMode,
  onNVToggle,
  onResChange,
  onFocusChange,
  onAction,
}) => {
  if (!isPowered)
    return (
      <button onClick={() => onAction("boot")} style={styles.bootBtn}>
        BOOT
      </button>
    );

  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      {/* Focus Dropdown */}
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        <Focus
          size={10}
          style={{
            position: "absolute",
            left: "6px",
            color: "#00f2ff",
            pointerEvents: "none",
          }}
        />
        <select
          value={focusMode}
          onChange={(e) => onFocusChange(e.target.value)}
          style={styles.dropdown}
        >
          <option value="auto">AF-C</option>
          <option value="near">NEAR</option>
          <option value="normal">MID</option>
          <option value="far">FAR</option>
        </select>
      </div>

      {/* Resolution Dropdown */}
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        <Settings
          size={10}
          style={{
            position: "absolute",
            left: "6px",
            color: "#00f2ff",
            pointerEvents: "none",
          }}
        />
        <select
          value={resMode}
          onChange={(e) => onResChange(e.target.value)}
          style={styles.dropdown}
        >
          <option value="240p">240P</option>
          <option value="480p">480P</option>
          <option value="720p">720P</option>
          <option value="1080p">1080P</option>
        </select>
      </div>

      {/* Night Vision Toggle */}
      <button
        onClick={() => onNVToggle(!nvActive)}
        style={{
          ...styles.baseBtn,
          backgroundColor: nvActive ? "#5522ff44" : "#33333322",
          color: nvActive ? "#b099ff" : "#888",
          display: "flex",
        }}
      >
        {nvActive ? <Moon size={12} /> : <Sun size={12} />}
        <span style={{ fontSize: "9px" }}>NV</span>
      </button>

      {/* Reboot & Shutdown */}
      <button
        onClick={() => onAction("reboot")}
        style={styles.baseBtn}
        title="Reboot"
      >
        <RefreshCw size={12} />
      </button>
      <button
        onClick={() => onAction("shutdown")}
        style={styles.baseBtn}
        title="Power Off"
      >
        <Power size={12} />
      </button>
    </div>
  );
};

const styles = {
  controlWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  iconOverlay: {
    position: "absolute",
    left: "6px",
    color: "#00f2ff",
    pointerEvents: "none",
    zIndex: 1,
  },
  baseBtn: {
    height: "22px", // Fixed height to match dropdown
    boxSizing: "border-box",
    padding: "0 8px",
    fontWeight: "bold",
    cursor: "pointer",
    fontFamily: "monospace",
    alignItems: "center",
    gap: "4px",
    borderRadius: "2px",
    fontSize: "10px",
    backgroundColor: "#b70101",
    color: "#ffffff",
    border: "1px solid #00f2ffaa",
    transition: "all 0.2s ease",
    outline: "none",
  },
  dropdown: {
    height: "22px", // Matching height
    boxSizing: "border-box",
    backgroundColor: "#1a1a1a",
    color: "#00f2ff",
    border: "1px solid #00f2ffaa",
    borderRadius: "2px",
    fontSize: "10px",
    fontFamily: "monospace",
    padding: "0 6px 0 20px",
    cursor: "pointer",
    outline: "none",
    appearance: "none",
  },
  bootBtn: {
    width: "auto",
    height: "22px",
    backgroundColor: "#00f2ff",
    border: "none",
    padding: "0 12px",
    borderRadius: "2px",
    fontWeight: "bold",
    cursor: "pointer",
    alignItems: "center",
    gap: "6px",
    fontFamily: "monospace",
    fontSize: "10px",
    color: "#000",
  },
};
