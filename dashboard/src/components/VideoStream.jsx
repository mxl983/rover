import { useEffect, useRef, useState } from "react";

const SERVER_IP = "rover.tail9d0237.ts.net";

export const VideoStream = () => {
  const videoRef = useRef(null);
  const pcRef = useRef(null); // Keep a reference to the peer connection
  const [isLoading, setIsLoading] = useState(true);

  const startWebRTC = async () => {
    // 1. Clean up existing connection if it exists
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setIsLoading(true);
    console.log("🛰️ Attempting to link satellite...");

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      // 2. MONITOR FOR FAILURE
      pc.onconnectionstatechange = () => {
        if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
          console.log("❌ Link lost. Retrying in 5s...");
          setIsLoading(true);

          // Wait 5 seconds and try a fresh handshake
          setTimeout(startWebRTC, 5000);
        }
      };

      pc.addTransceiver("video", { direction: "recvonly" });

      pc.ontrack = (e) => {
        if (videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.play().catch(() => {});
          videoRef.current.onloadedmetadata = () => setIsLoading(false);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`http://${SERVER_IP}:8889/cam/whep`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });

      if (!res.ok) throw new Error("Server offline");

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      console.error("📡 Signal Error:", err.message);
      setIsLoading(true);
      // If the fetch fails (server down), try again in 5s
      setTimeout(startWebRTC, 5000);
    }
  };

  useEffect(() => {
    startWebRTC();
    return () => pcRef.current?.close();
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#050505",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      {isLoading && (
        <div className="video-loader">
          <div className="hex-container">
            <svg viewBox="0 0 100 100" className="hex-svg">
              <polygon
                points="50,5 90,25 90,75 50,95 10,75 10,25"
                fill="none"
                stroke="#00f2ff"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="loading-text">LINKING_SATELLITE...</div>
        </div>
      )}

      <div
        style={{
          position: "relative", // Essential for absolute children
          width: "100%",
          height: "100%",
          opacity: isLoading ? 0 : 1,
          transition: "opacity 1s ease",
          overflow: "hidden",
          aspectRatio: "16 / 9", // Force the container to match the 720p stream
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />

        {/* Drive assist HUD */}
        {!isLoading && (
          <svg
            viewBox="0 0 160 90"
            style={{
              zIndex: 10,
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <defs>
              /* 1. This creates the "Neon Glow" effect */
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="0.8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Left Fancy Line */}
            <line
              x1="54.5"
              y1="90"
              x2="70"
              y2="45"
              stroke="#00f2ff"
              strokeWidth="0.8"
              strokeDasharray="4, 2"
              filter="url(#glow)"
              opacity="0.2"
            />

            {/* Right Fancy Line (Symmetrical) */}
            <line
              x1="115"
              y1="90"
              x2="85"
              y2="45"
              stroke="#00f2ff"
              strokeWidth="0.8"
              strokeDasharray="4, 2"
              filter="url(#glow)"
              opacity="0.2"
            />
          </svg>
        )}
      </div>

      <style>{`
        .video-loader { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 5; background: #000; }
        .hex-svg { width: 80px; height: 80px; animation: rotate 4s linear infinite; }
        .loading-text { margin-top: 20px; color: #00f2ff; font-family: monospace; font-size: 10px; letter-spacing: 3px; animation: blink 2s infinite; }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.4); opacity: 1; } }
        @keyframes blink { 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
};
