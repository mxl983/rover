import { useEffect, useRef, useState } from "react";

const SERVER_IP = "rover.tail9d0237.ts.net";

export const VideoStream = () => {
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function startWebRTC() {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        pc.addTransceiver("video", { direction: "recvonly" });

        pc.ontrack = (e) => {
          if (videoRef.current) {
            videoRef.current.srcObject = e.streams[0];
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

        const answer = await res.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      } catch (err) {
        console.error("WebRTC Error:", err);
      }
    }

    startWebRTC();
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
          {/* Animated Hexagon SVG */}
          <div className="hex-container">
            <svg viewBox="0 0 100 100" className="hex-svg">
              <polygon
                points="50,5 90,25 90,75 50,95 10,75 10,25"
                fill="none"
                stroke="#00f2ff"
                strokeWidth="2"
              />
            </svg>
            <div className="hex-inner"></div>
          </div>
          <div className="loading-text">LINKING_SATELLITE...</div>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        id="videoPlayer"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: isLoading ? 0 : 1,
          transition: "opacity 1.5s ease",
        }}
      />

      <style>{`
        .video-loader {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 5;
          background: radial-gradient(circle, #0a0a0a 0%, #000 100%);
        }

        .hex-container {
          position: relative;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hex-svg {
          width: 100%;
          height: 100%;
          animation: hex-rotate 4s linear infinite;
          filter: drop-shadow(0 0 8px #00f2ff);
        }

        .hex-inner {
          position: absolute;
          width: 20px;
          height: 20px;
          background: #00f2ff;
          clip-path: polygon(50% 0%, 90% 25%, 90% 75%, 50% 100%, 10% 75%, 10% 25%);
          animation: hex-pulse 1.5s ease-in-out infinite;
        }

        .loading-text {
          margin-top: 24px;
          color: #00f2ff;
          font-family: 'Segoe UI', monospace;
          font-size: 11px;
          letter-spacing: 4px;
          text-transform: uppercase;
          text-shadow: 0 0 10px #00f2ff;
          animation: text-blink 2s infinite;
        }

        @keyframes hex-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes hex-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.5); opacity: 1; }
        }

        @keyframes text-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};
