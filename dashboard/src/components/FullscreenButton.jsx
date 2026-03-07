import React, { useState, useEffect } from "react";
import { Maximize, Minimize } from "lucide-react";

export const FullscreenButton = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    // Detect support for standard or webkit (Safari/iOS)
    const canFs =
      document.fullscreenEnabled || document.webkitFullscreenEnabled;
    setIsSupported(!!canFs);

    const handleFsChange = () => {
      setIsFullscreen(
        !!(document.fullscreenElement || document.webkitFullscreenElement),
      );
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const el = document.documentElement;
      const requestFs = el.requestFullscreen || el.webkitRequestFullscreen;
      if (requestFs) {
        requestFs.call(el).catch((e) => console.error(e));
      }
    } else {
      const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFs) exitFs.call(document);
    }
  };

  // Hide on iPhone/iOS Chrome as they don't support the Fullscreen API
  if (!isSupported) return null;

  return isFullscreen ? (
    <Minimize
      size={16}
      style={styles.bareIcon}
      onClick={toggleFullscreen}
      title="Exit Fullscreen"
    />
  ) : (
    <Maximize
      size={16}
      style={styles.bareIcon}
      onClick={toggleFullscreen}
      title="Enter Fullscreen"
    />
  );
};

const styles = {
  bareIcon: {
    color: "#00f2ff",
    cursor: "pointer",
    opacity: 0.7,
    transition: "all 0.2s ease",
    padding: "4px",
    // Adding a slight hover effect to match the "Settings" feel
    ":hover": {
      opacity: 1,
    },
    marginRight: "20px",
  },
};
