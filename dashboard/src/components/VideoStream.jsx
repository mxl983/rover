import { useEffect, useRef, useState, useCallback } from "react";
import {
  PI_SERVER_IP,
  VIDEO_STREAM_HOST,
  AUDIO_STREAM_HOST,
} from "../constants";

export const VideoStream = () => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const audioPcRef = useRef(null);

  const retryTimeoutRef = useRef({ video: null, audio: null });

  const isAudioEnabledRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);

  const cleanup = (type) => {
    if (type === "video") {
      pcRef.current?.close();
      pcRef.current = null;
    } else {
      audioPcRef.current?.close();
      audioPcRef.current = null;
    }
    if (retryTimeoutRef.current[type]) {
      clearTimeout(retryTimeoutRef.current[type]);
    }
  };

  // --- VIDEO HANDSHAKE ---
  const startVideoWebRTC = useCallback(async () => {
    cleanup("video");
    setIsLoading(true);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      // Reconnect if connection drops
      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed"
        ) {
          console.warn("📹 Video stream lost. Retrying...");
          retryTimeoutRef.current.video = setTimeout(startVideoWebRTC, 3000);
        }
      };

      pc.addTransceiver("video", { direction: "recvonly" });

      pc.ontrack = (e) => {
        if (videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.onloadedmetadata = () => setIsLoading(false);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(VIDEO_STREAM_HOST, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });

      if (!res.ok) throw new Error("Video server unreachable");
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      console.error("📡 Video Signal Error:", err);
      retryTimeoutRef.current.video = setTimeout(startVideoWebRTC, 5000);
    }
  }, []);

  // --- AUDIO HANDSHAKE ---
  const startAudioWebRTC = useCallback(async () => {
    cleanup("audio");

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      audioPcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed"
        ) {
          console.warn("🔊 Audio stream lost. Retrying...");
          retryTimeoutRef.current.audio = setTimeout(startAudioWebRTC, 3000);
        }
      };

      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          // If the user previously had audio ON, resume it automatically on reconnect
          if (isAudioEnabledRef.current) {
            audioRef.current.play().catch(() => {});
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(AUDIO_STREAM_HOST, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });

      if (!res.ok) throw new Error("Audio server unreachable");
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      console.error("📡 Audio Signal Error:", err);
      retryTimeoutRef.current.audio = setTimeout(startAudioWebRTC, 5000);
    }
  }, []);

  const handleToggleAudio = () => {
    if (!audioEnabled) {
      audioRef.current?.play().catch((e) => console.error("Audio blocked", e));
      setAudioEnabled(true);
      isAudioEnabledRef.current = true;
    } else {
      audioRef.current?.pause();
      setAudioEnabled(false);
      isAudioEnabledRef.current = false;
    }
  };

  useEffect(() => {
    startVideoWebRTC();
    startAudioWebRTC();
    return () => {
      cleanup("video");
      cleanup("audio");
    };
  }, [startVideoWebRTC, startAudioWebRTC]);

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
      <audio ref={audioRef} autoPlay={false} />

      {!isLoading && (
        <button
          onClick={handleToggleAudio}
          style={{
            position: "absolute",
            top: "10px",
            right: "50%",
            zIndex: 100,
            background: "rgba(0,0,0,0.5)",
            border: "1px solid #00f2ff",
            color: "#00f2ff",
            padding: "5px 10px",
            cursor: "pointer",
            fontSize: "10px",
            fontFamily: "monospace",
            width: "fit-content",
            transform: "translateX(50%)",
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
