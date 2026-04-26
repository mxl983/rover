import { useEffect, useRef, useState, useCallback } from "react";
import {
  VIDEO_STREAM_HOST,
  AUDIO_STREAM_HOST,
  AUDIO_TALK_HOST,
  ROVER_STATE_ENDPOINT,
} from "../constants";
import { apiFetch } from "../api/client";
import { VideoLoadingPhysics } from "./VideoLoadingPhysics.jsx";

export const VideoStream = ({
  dockingData: _dockingData,
  onVideoReadyChange,
  backupStreamUrl = "",
  showBackupView = false,
}) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const talkPcRef = useRef(null);
  const listenPcRef = useRef(null);
  const localStreamRef = useRef(null);
  const retryTimeoutRef = useRef({ video: null, talk: null, listen: null });
  const reconnectInFlightRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadingPercent, setLoadingPercent] = useState(null);
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [backupAvailable, setBackupAvailable] = useState(true);
  const [roverMicEnabled, setRoverMicEnabled] = useState(false);
  const [dashMicEnabled, setDashMicEnabled] = useState(false);

  useEffect(() => {
    onVideoReadyChange?.(!isLoading);
  }, [isLoading, onVideoReadyChange]);

  useEffect(() => {
    if (!isLoading) return undefined;
    let cancelled = false;
    let inFlight = false;

    const parsePercent = (data) => {
      if (!data || typeof data !== "object") return null;
      const asNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
      };
      return (
        asNum(data.bootPercentage) ??
        asNum(data.bootPercent) ??
        asNum(data.progressPct) ??
        asNum(data.progress) ??
          asNum(data?.rover?.bootProgressPct) ??
          asNum(data?.rover?.bootPercentage) ??
          asNum(data?.rover?.bootPercent) ??
          asNum(data?.rover?.progressPct) ??
          asNum(data?.rover?.progress) ??
        asNum(data?.state?.bootPercentage) ??
        asNum(data?.state?.bootPercent)
      );
    };

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await apiFetch(ROVER_STATE_ENDPOINT, {
          method: "GET",
          timeout: 1200,
          retries: 0,
        });
        if (!res.ok) return;
        const text = await res.text();
        if (!text) return;
        const data = JSON.parse(text);
        const pct = parsePercent(data);
        if (pct != null && !cancelled) setLoadingPercent(pct);
      } catch {
        // Relay unavailable: keep loader functional without percentage.
        if (!cancelled) setLoadingPercent(null);
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isLoading]);

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
    retryTimeoutRef.current[type] = null;
  };

  const startVideoWebRTC = useCallback(async (opts = {}) => {
    const { showLoader = true } = opts;
    reconnectInFlightRef.current = false;
    cleanup("video");
    if (showLoader) setIsLoading(true);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      const scheduleReconnect = (delayMs, forceLoader = false) => {
        if (reconnectInFlightRef.current) return;
        reconnectInFlightRef.current = true;
        retryTimeoutRef.current.video = setTimeout(() => {
          void startVideoWebRTC({ showLoader: forceLoader });
        }, delayMs);
      };

      // Detect stream drops, but avoid full-screen flash for transient disconnects.
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "disconnected") scheduleReconnect(900, false);
        else if (state === "failed" || state === "closed") scheduleReconnect(800, true);
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
      retryTimeoutRef.current.video = setTimeout(() => {
        void startVideoWebRTC({ showLoader: true });
      }, 2000);
    }
  }, []);

  const startTalkWebRTC = useCallback(async () => {
    cleanup("talk");
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      talkPcRef.current = pc;
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected" || state === "closed") {
          retryTimeoutRef.current.talk = setTimeout(() => {
            void startTalkWebRTC();
          }, 1500);
        }
      };
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
      retryTimeoutRef.current.talk = setTimeout(() => {
        void startTalkWebRTC();
      }, 2200);
    }
  }, [dashMicEnabled]);

  const startListenWebRTC = useCallback(async () => {
    cleanup("listen");
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      listenPcRef.current = pc;
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected" || state === "closed") {
          retryTimeoutRef.current.listen = setTimeout(() => {
            void startListenWebRTC();
          }, 1500);
        }
      };
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
      retryTimeoutRef.current.listen = setTimeout(() => {
        void startListenWebRTC();
      }, 2200);
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

  useEffect(() => {
    const resumeVideoElement = () => {
      const el = videoRef.current;
      if (!el) return;
      const playPromise = el.play?.();
      if (typeof playPromise?.catch === "function") playPromise.catch(() => {});
    };
    const onVisibility = () => {
      if (!document.hidden) resumeVideoElement();
    };
    window.addEventListener("orientationchange", resumeVideoElement);
    window.addEventListener("resize", resumeVideoElement);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("orientationchange", resumeVideoElement);
      window.removeEventListener("resize", resumeVideoElement);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!showBackupView) {
      setIsBackupLoading(false);
      setBackupAvailable(true);
      return;
    }
    setBackupAvailable(true);
    setIsBackupLoading(Boolean(backupStreamUrl));
  }, [showBackupView, backupStreamUrl]);

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

      {isLoading && (
        <div style={loaderWrapper}>
          <VideoLoadingPhysics />
          <div style={loaderForeground}>
            <div className="glitch-text polygon-label" style={loaderTextStyle}>
              COSMIC PIT STOP IN PROGRESS
              {loadingPercent != null ? ` — ${loadingPercent}% READY` : ""}
            </div>
            <div style={loaderSubStyle}>tuning antennas, dodging asteroids, and finding your rover feed...</div>
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

      {showBackupView && backupAvailable && (
        <div style={pipContainerStyle}>
          {backupStreamUrl ? (
            <>
              <img
                src={backupStreamUrl}
                alt="Backup camera stream"
                style={pipVideoStyle}
                onLoad={() => {
                  setIsBackupLoading(false);
                }}
                onError={() => {
                  setIsBackupLoading(false);
                  // Relay unavailable: remove backup PiP and keep main view unaffected.
                  setBackupAvailable(false);
                }}
              />
              <div style={backupBadgeStyle}>BACKUP VIEW</div>
              <div style={pipCursorStyle} aria-hidden="true" />
              {isBackupLoading ? (
                <div style={pipOverlayTextStyle}>Connecting...</div>
              ) : null}
            </>
          ) : (
            <div style={backupMissingStyle}>Backup stream URL is not configured.</div>
          )}
        </div>
      )}

      <style>{`
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
  background: "#030308",
  zIndex: 50,
  overflow: "hidden",
};

const loaderForeground = {
  position: "relative",
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  padding: "0 16px",
};

const loaderTextStyle = {
  color: "#00f2ff",
  fontSize: "14px",
  fontWeight: "bold",
  letterSpacing: "4px",
  textAlign: "center",
};

const loaderSubStyle = {
  marginTop: "12px",
  color: "rgba(255,255,255,0.45)",
  fontSize: "11px",
  letterSpacing: "0.08em",
  textAlign: "center",
  maxWidth: "280px",
  lineHeight: 1.45,
};

const backupMissingStyle = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(255, 255, 255, 0.75)",
  fontSize: "14px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  textAlign: "center",
  padding: "8px",
};

const backupBadgeStyle = {
  position: "absolute",
  top: "8px",
  left: "8px",
  zIndex: 120,
  padding: "4px 8px",
  borderRadius: "8px",
  color: "#f3e8ff",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  background: "rgba(139, 92, 246, 0.7)",
  border: "1px solid rgba(196, 181, 253, 0.85)",
};

const pipContainerStyle = {
  position: "absolute",
  top: "20px",
  right: "20px",
  width: "28vw",
  maxWidth: "360px",
  minWidth: "220px",
  aspectRatio: "4 / 3",
  overflow: "hidden",
  borderRadius: "10px",
  border: "1px solid rgba(196, 181, 253, 0.75)",
  background: "rgba(0, 0, 0, 0.8)",
  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.45)",
  zIndex: 115,
};

const pipVideoStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const pipOverlayTextStyle = {
  position: "absolute",
  left: "50%",
  bottom: "10px",
  transform: "translateX(-50%)",
  background: "rgba(0, 0, 0, 0.58)",
  color: "#f3f4f6",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  borderRadius: "8px",
  fontSize: "11px",
  padding: "6px 8px",
  whiteSpace: "nowrap",
};

const pipCursorStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "12px",
  height: "12px",
  border: "1px solid rgba(255, 255, 255, 0.75)",
  borderRadius: "50%",
  boxShadow: "0 0 8px rgba(255, 255, 255, 0.35)",
  zIndex: 121,
  pointerEvents: "none",
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
