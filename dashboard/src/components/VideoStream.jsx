import { useEffect, useRef, useState, useCallback } from "react";
import {
  VIDEO_STREAM_HOST,
  AUDIO_STREAM_HOST,
  AUDIO_TALK_HOST,
} from "../constants";

export const VideoStream = ({ dockingData: _dockingData, onVideoReadyChange }) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const talkPcRef = useRef(null);
  const listenPcRef = useRef(null);
  const localStreamRef = useRef(null);
  const retryTimeoutRef = useRef({ video: null, talk: null, listen: null });

  const [isLoading, setIsLoading] = useState(true);
  const [roverMicEnabled, setRoverMicEnabled] = useState(false);
  const [dashMicEnabled, setDashMicEnabled] = useState(false);

  useEffect(() => {
    onVideoReadyChange?.(!isLoading);
  }, [isLoading, onVideoReadyChange]);

  const cleanup = (type) => {
    if (type === "video") {
      pcRef.current?.close();
      pcRef.current = null;
    } else if (type === "talk") {
      talkPcRef.current?.close();
      talkPcRef.current = null;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    } else if (type === "listen") {
      listenPcRef.current?.close();
      listenPcRef.current = null;
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

      // CRITICAL: Detect when stream drops (e.g., during resolution change)
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          console.log(`Video connection ${state}. Retrying...`);
          setIsLoading(true);
          retryTimeoutRef.current.video = setTimeout(startVideoWebRTC, 2000);
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

      if (res.ok) {
        const answer = await res.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      } else {
        throw new Error("Video SDP exchange failed");
      }
    } catch {
      retryTimeoutRef.current.video = setTimeout(startVideoWebRTC, 3000);
    }
  }, []);

  const startTalkWebRTC = useCallback(async () => {
    cleanup("talk");
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      talkPcRef.current = pc;
      const transceiver = pc.addTransceiver("audio", { direction: "sendonly" });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      track.enabled = dashMicEnabled;
      transceiver.sender.replaceTrack(track);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch(AUDIO_TALK_HOST, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });
      if (res.ok) {
        const answer = await res.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      }
    } catch (err) {
      console.error("Talk Error:", err);
    }
  }, [dashMicEnabled]);

  const startListenWebRTC = useCallback(async () => {
    cleanup("listen");
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      listenPcRef.current = pc;
      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.muted = !roverMicEnabled;
        }
      };
      pc.addTransceiver("audio", { direction: "recvonly" });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch(AUDIO_STREAM_HOST, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });
      if (res.ok) {
        const answer = await res.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      }
    } catch (err) {
      console.error("Listen Error:", err);
    }
  }, [roverMicEnabled]);

  const toggleDashMic = () => {
    const newState = !dashMicEnabled;
    setDashMicEnabled(newState);
    if (localStreamRef.current) {
      localStreamRef.current
        .getAudioTracks()
        .forEach((t) => (t.enabled = newState));
    }
  };

  const toggleRoverMic = () => {
    const newState = !roverMicEnabled;
    setRoverMicEnabled(newState);
    if (audioRef.current) audioRef.current.muted = !newState;
  };

  useEffect(() => {
    startVideoWebRTC();
    startTalkWebRTC();
    startListenWebRTC();
    return () => {
      cleanup("video");
      cleanup("talk");
      cleanup("listen");
    };
  }, [startVideoWebRTC, startTalkWebRTC, startListenWebRTC]);

  return (
    <div style={containerStyle}>
      <audio ref={audioRef} autoPlay />

      {/* HUD OVERLAY */}
      <div style={hudWrapper}>
        <button
          onClick={toggleRoverMic}
          style={btnStyle(roverMicEnabled, "#00f2ff")}
        >
          <SpeakerIcon active={roverMicEnabled} />
        </button>
        <button
          onClick={toggleDashMic}
          style={btnStyle(dashMicEnabled, "#ff0055")}
        >
          <MicIcon active={dashMicEnabled} />
        </button>
      </div>

      {/* LOADING — central dot jumping */}
      {isLoading && (
        <div style={loaderWrapper}>
          <div className="loader-common" style={polygonLoaderStyle}>
            <svg viewBox="0 0 100 100" className="loader-svg">
              <circle cx="50" cy="50" r="8" fill="#00f2ff" className="loader-dot-jump" />
            </svg>
          </div>
          <div className="glitch-text polygon-label" style={loaderTextStyle}>
            SIGNAL LOST — RECONNECTING
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ ...videoStyle, opacity: isLoading ? 0.3 : 1 }}
      />

      <style>{`
        .loader-common {
          width: 72px;
          height: 72px;
          margin-bottom: 14px;
        }
        .loader-svg {
          width: 100%;
          height: 100%;
        }
        .loader-dot-jump {
          animation: loader-dot-jump 0.6s ease-in-out infinite;
        }
        @keyframes loader-dot-jump {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-18px); }
        }
        .polygon-label.glitch-text {
          animation: glitch 1s linear infinite;
          text-shadow: 2px 0 #ff0055, -2px 0 #00f2ff;
        }
      `}</style>
    </div>
  );
};

// --- SVG ICONS ---
const SpeakerIcon = ({ active }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke={active ? "#00f2ff" : "#888"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon
      points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
      fill={active ? "#00f2ff33" : "none"}
    />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    {!active && <line x1="4" y1="20" x2="20" y2="4" stroke="#ff4d4f" strokeWidth="2.4" />}
  </svg>
);

const MicIcon = ({ active }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke={active ? "#fff" : "#888"}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path
      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
      fill={active ? "#ff0055" : "none"}
    />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    {!active && <line x1="4" y1="20" x2="20" y2="4" stroke="#ff4d4f" strokeWidth="2.4" />}
  </svg>
);

// --- STYLES ---
const containerStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  background: "#050505",
  overflow: "hidden",
};
const videoStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  transition: "opacity 0.5s",
};
const hudWrapper = {
  position: "absolute",
  top: "20px",
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: "20px",
  zIndex: 100,
};

const loaderWrapper = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "#000",
  zIndex: 50,
  overflow: "hidden",
};

const loaderTextStyle = {
  color: "#00f2ff",
  fontSize: "14px",
  fontWeight: "bold",
  letterSpacing: "4px",
};

const polygonLoaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnStyle = (active, color) => ({
  background: active ? `${color}22` : "rgba(0,0,0,0.75)",
  border: `1px solid ${active ? color : "#666"}`,
  borderRadius: "50%",
  width: "40px",
  height: "40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.2s ease",
  boxShadow: active ? `0 0 15px ${color}44` : "inset 0 0 0 1px rgba(255,77,79,0.28)",
  opacity: active ? 1 : 0.7,
});
