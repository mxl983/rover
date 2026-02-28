import React, { useState, useEffect } from "react";
import {
  Power,
  RefreshCw,
  Moon,
  Sun,
  Settings,
  Focus,
  ChevronRight,
} from "lucide-react";

export const SystemControls = ({
  isPowered,
  nvActive,
  resMode,
  focusMode,
  onNVToggle,
  onResChange,
  onFocusChange,
  onAction,
  onExpandChange, // New prop to notify parent
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Notify parent when expansion state changes
  useEffect(() => {
    onExpandChange?.(isExpanded);
  }, [isExpanded, onExpandChange]);

  if (!isPowered)
    return (
      <button onClick={() => onAction("boot")} style={styles.bootBtn}>
        BOOT
      </button>
    );

  // --- COLLAPSED STATE (Bare Icon) ---
  if (!isExpanded) {
    return (
      <div style={styles.expandedWrapper}>
        <div style={styles.controlWrapper}>
          <Settings
            size={16}
            style={styles.bareIcon}
            onClick={() => setIsExpanded(true)}
          />
        </div>
      </div>
    );
  }

  // --- EXPANDED STATE ---
  return (
    <div style={styles.expandedWrapper}>
      <div style={styles.controlWrapper}>
        <Focus size={10} style={styles.iconOverlay} />
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

      <div style={styles.controlWrapper}>
        <Settings size={10} style={styles.iconOverlay} />
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

      <button
        onClick={() => onNVToggle(!nvActive)}
        style={{ ...styles.baseBtn, color: nvActive ? "#b099ff" : "#888" }}
      >
        {nvActive ? <Moon size={12} /> : <Sun size={12} />}
        <span style={{ fontSize: "9px" }}>NV</span>
      </button>

      <button onClick={() => onAction("reboot")} style={styles.baseBtn}>
        <RefreshCw size={12} />
      </button>
      <button onClick={() => onAction("shutdown")} style={styles.powerBtn}>
        <Power size={12} />
      </button>

      <ChevronRight
        size={18}
        style={styles.bareIcon}
        onClick={() => setIsExpanded(false)}
      />
    </div>
  );
};

const styles = {
  bareIcon: {
    color: "#00f2ff",
    cursor: "pointer",
    opacity: 0.7,
    transition: "opacity 0.2s",
    padding: "4px",
  },
  expandedWrapper: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
    background: "rgba(0,0,0,0.6)",
    padding: "4px 8px",
    borderRadius: "4px",
    border: "1px solid rgba(0, 242, 255, 0.2)",
    animation: "appear 0.2s ease-out",
  },
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
  },
  baseBtn: {
    height: "22px",
    padding: "0 8px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    backgroundColor: "#1a1a1a",
    color: "#00f2ff",
    border: "1px solid #00f2ffaa",
    borderRadius: "2px",
    cursor: "pointer",
  },
  powerBtn: {
    height: "22px",
    padding: "0 8px",
    backgroundColor: "#b70101",
    color: "#fff",
    border: "1px solid #ff4444",
    borderRadius: "2px",
    cursor: "pointer",
  },
  dropdown: {
    height: "22px",
    backgroundColor: "#1a1a1a",
    color: "#00f2ff",
    border: "1px solid #00f2ffaa",
    borderRadius: "2px",
    fontSize: "10px",
    padding: "0 4px 0 20px",
    appearance: "none",
    cursor: "pointer",
  },
  bootBtn: {
    height: "22px",
    backgroundColor: "#00f2ff",
    border: "none",
    padding: "0 12px",
    borderRadius: "2px",
    fontWeight: "bold",
    cursor: "pointer",
  },
};
