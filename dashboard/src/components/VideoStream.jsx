import { useEffect, useRef, useState } from "react";

const SERVER_IP = "rover.tail9d0237.ts.net";

export const VideoStream = () => {
  const videoRef = useRef(null);
  const audioRef = useRef(null); // Separate ref for audio
  const pcRef = useRef(null);
  const audioPcRef = useRef(null); // Separate PC for audio stream
  const [isLoading, setIsLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // --- VIDEO HANDSHAKE ---
  const startVideoWebRTC = async () => {
    if (pcRef.current) pcRef.current.close();
    setIsLoading(true);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;
      pc.addTransceiver("video", { direction: "recvonly" });

      pc.ontrack = (e) => {
        if (videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.onloadedmetadata = () => setIsLoading(false);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`https://${SERVER_IP}:8889/cam/whep`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      console.error("📡 Video Signal Error:", err);
      setTimeout(startVideoWebRTC, 5000);
    }
  };

  // --- AUDIO HANDSHAKE ---
  const startAudioWebRTC = async () => {
    if (audioPcRef.current) audioPcRef.current.close();

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      audioPcRef.current = pc;
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          // We don't play() yet to avoid browser "Autoplay Policy" crashes
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`https://${SERVER_IP}:8889/mic/whep`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      console.error("📡 Audio Signal Error:", err);
    }
  };

  const handleToggleAudio = () => {
    if (!audioEnabled) {
      audioRef.current
        ?.play()
        .catch((e) => console.error("Audio play blocked", e));
      setAudioEnabled(true);
    } else {
      audioRef.current?.pause();
      setAudioEnabled(false);
    }
  };

  useEffect(() => {
    startVideoWebRTC();
    startAudioWebRTC();
    return () => {
      pcRef.current?.close();
      audioPcRef.current?.close();
    };
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
      {/* Hidden Audio Element */}
      <audio ref={audioRef} autoPlay={false} />

      {/* Audio Control UI */}
      {!isLoading && (
        <button
          onClick={handleToggleAudio}
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            zIndex: 100,
            background: "rgba(0,0,0,0.5)",
            border: "1px solid #00f2ff",
            color: "#00f2ff",
            padding: "5px 10px",
            cursor: "pointer",
            fontSize: "10px",
            fontFamily: "monospace",
          }}
        >
          {audioEnabled ? "🔊 MIC_LIVE" : "🔇 MIC_MUTED"}
        </button>
      )}

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
          position: "relative",
          width: "100%",
          height: "100%",
          opacity: isLoading ? 0 : 1,
          transition: "opacity 1s ease",
          overflow: "hidden",
          aspectRatio: "16 / 9",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />

        {/* HUD Layer */}
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
              <linearGradient
                id="fadeGradient"
                x1="0%"
                y1="100%"
                x2="0%"
                y2="0%"
              >
                <stop offset="0%" stopColor="black" />
                <stop offset="20%" stopColor="white" />
                <stop offset="80%" stopColor="white" />
                <stop offset="100%" stopColor="black" />
              </linearGradient>
              <mask id="lineMask">
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  fill="url(#fadeGradient)"
                />
              </mask>
              <filter id="glow">
                <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <line
              className="energy-line"
              x1="54.5"
              y1="90"
              x2="70"
              y2="45"
              stroke="#00f2ff"
              strokeWidth="0.8"
              strokeDasharray="4, 2"
              mask="url(#lineMask)"
              filter="url(#glow)"
              opacity="0.1"
            />
            <line
              className="energy-line"
              x1="115"
              y1="90"
              x2="85"
              y2="45"
              stroke="#00f2ff"
              strokeWidth="0.8"
              strokeDasharray="4, 2"
              mask="url(#lineMask)"
              filter="url(#glow)"
              opacity="0.1"
            />
          </svg>
        )}
      </div>

      <style>{`
        .video-loader { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 5; background: #000; }
        .hex-svg { width: 80px; height: 80px; animation: rotate 4s linear infinite; }
        .loading-text { margin-top: 20px; color: #00f2ff; font-family: monospace; font-size: 10px; letter-spacing: 3px; animation: blink 2s infinite; }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
};
