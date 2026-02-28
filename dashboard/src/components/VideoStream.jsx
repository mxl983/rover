import { useEffect, useRef, useState, useCallback } from "react";
import { VIDEO_STREAM_HOST, AUDIO_STREAM_HOST } from "../constants";

export const VideoStream = ({ dockingData }) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const audioPcRef = useRef(null);
  const speakerStreamRef = useRef(null);
  const retryTimeoutRef = useRef({ video: null, audio: null });

  const [isLoading, setIsLoading] = useState(true);
  const [roverMicEnabled, setRoverMicEnabled] = useState(false); // Listening to Rover
  const [dashMicEnabled, setDashMicEnabled] = useState(false); // Talking to Rover (Toggle)

  const isFound = dockingData?.status === "found";
  const markers = dockingData?.markers || [];

  const cleanup = (type) => {
    if (type === "video") {
      pcRef.current?.close();
      pcRef.current = null;
    } else {
      audioPcRef.current?.close();
      audioPcRef.current = null;
      if (speakerStreamRef.current) {
        speakerStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    }
    if (retryTimeoutRef.current[type])
      clearTimeout(retryTimeoutRef.current[type]);
  };

  const startVideoWebRTC = useCallback(async () => {
    cleanup("video");
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

      // Strict Content-Type to fix the error you were seeing
      const res = await fetch(VIDEO_STREAM_HOST, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      retryTimeoutRef.current.video = setTimeout(startVideoWebRTC, 5000);
    }
  }, []);

  const startAudioWebRTC = useCallback(async () => {
    cleanup("audio");
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      audioPcRef.current = pc;

      // 1. Capture Local Mic (Dashboard -> Rover)
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        speakerStreamRef.current = localStream;
        localStream
          .getTracks()
          .forEach((track) => pc.addTrack(track, localStream));
        // Keep synced with state
        localStream.getAudioTracks()[0].enabled = dashMicEnabled;
      } catch (e) {
        console.warn("Mic access denied");
      }

      // 2. Setup 2-Way Link
      pc.addTransceiver("audio", { direction: "sendrecv" });
      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0];
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Strict header is essential for WHIP/WHEP endpoints
      const res = await fetch(AUDIO_STREAM_HOST, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });

      if (res.status !== 201 && res.status !== 200) {
        throw new Error(`SDP Error: ${res.status}`);
      }

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      retryTimeoutRef.current.audio = setTimeout(startAudioWebRTC, 5000);
    }
  }, [dashMicEnabled]); // Re-init if mic permissions change

  // --- TOGGLE HANDLERS ---
  const toggleRoverMic = () => {
    const newState = !roverMicEnabled;
    setRoverMicEnabled(newState);
    newState ? audioRef.current?.play() : audioRef.current?.pause();
  };

  const toggleDashMic = () => {
    const newState = !dashMicEnabled;
    setDashMicEnabled(newState);
    if (speakerStreamRef.current) {
      speakerStreamRef.current.getAudioTracks()[0].enabled = newState;
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

      {/* --- HUD CONTROLS --- */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "15px",
          zIndex: 100,
        }}
      >
        {/* Rover Mic (Listen Toggle) */}
        <button
          onClick={toggleRoverMic}
          style={btnStyle(roverMicEnabled, "#00f2ff")}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke={roverMicEnabled ? "#00f2ff" : "#888"}
            strokeWidth="2"
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            {roverMicEnabled ? (
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            ) : (
              <path d="M23 9l-6 6M17 9l6 6" />
            )}
            {/* The Mute Slash */}
            {!roverMicEnabled && (
              <line
                x1="23"
                y1="1"
                x2="1"
                y2="23"
                stroke="#ff0055"
                strokeWidth="3"
              />
            )}
          </svg>
        </button>

        {/* Dashboard Mic (Talk Toggle) */}
        <button
          onClick={toggleDashMic}
          style={btnStyle(dashMicEnabled, "#ff0055")}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke={dashMicEnabled ? "#fff" : "#888"}
            strokeWidth="2"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
            {/* The Mute Slash */}
            {!dashMicEnabled && (
              <line
                x1="23"
                y1="1"
                x2="1"
                y2="23"
                stroke="#ff0055"
                strokeWidth="3"
              />
            )}
          </svg>
        </button>
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          opacity: isLoading ? 0 : 1,
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />

        {/* 720p Overlay (1280x720) */}
        <svg
          viewBox="0 0 1280 720"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {isFound &&
            markers.map((m, i) => (
              <g key={i} filter="url(#glow)">
                <polygon
                  points={m.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
                  fill="rgba(0, 242, 255, 0.15)"
                  stroke="#00f2ff"
                  strokeWidth="3"
                />
                <text
                  x={m.points[0][0]}
                  y={m.points[0][1] - 10}
                  fill="#00f2ff"
                  fontSize="16"
                  fontFamily="monospace"
                >
                  ID::{m.id} X:{dockingData.x} Z:{dockingData.z}
                </text>
              </g>
            ))}
        </svg>
      </div>
    </div>
  );
};

const btnStyle = (active, color) => ({
  background: active ? `${color}33` : "rgba(0,0,0,0.6)",
  border: `1px solid ${active ? color : "#555"}`,
  borderRadius: "50%",
  width: "45px",
  height: "45px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.2s",
  boxShadow: active ? `0 0 15px ${color}66` : "none",
});
