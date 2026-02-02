import { useEffect, useRef, useState } from "react";

const SERVER_IP = "rover.tail9d0237.ts.net";

export const VideoStream = () => {
  const videoRef = useRef(null);

  useEffect(() => {
    async function startWebRTC() {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.ontrack = (e) => (videoRef.current.srcObject = e.streams[0]);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`http://${SERVER_IP}:8889/cam/whep`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    }

    startWebRTC();
  }, []);

  return <video ref={videoRef} autoPlay muted playsInline id="videoPlayer" />;
};
