import { useEffect, useRef, useState } from "react";

const PI_IP = "rover.tail9d0237.ts.net";

export default function App() {
  const videoRef = useRef(null);
  const socketRef = useRef(null);

  const [clock, setClock] = useState("00:00:00");
  const [latency, setLatency] = useState(0);
  const [pan, setPan] = useState(0);

  const PAN_STEP = 5;
  const MAX_PAN = 90;
  let pingStart = useRef(0);

  /* Clock */
  useEffect(() => {
    const t = setInterval(
      () => setClock(new Date().toLocaleTimeString()),
      1000
    );
    return () => clearInterval(t);
  }, []);

  /* WebSocket */
  useEffect(() => {
    const socket = new WebSocket(`ws://${PI_IP}:3000`);
    socketRef.current = socket;

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "PONG") {
        setLatency(Date.now() - pingStart.current);
      }
    };

    const pingInterval = setInterval(() => {
      pingStart.current = Date.now();
      socket.send(JSON.stringify({ type: "PING" }));
    }, 3000);

    return () => {
      clearInterval(pingInterval);
      socket.close();
    };
  }, []);

  /* WebRTC */
  useEffect(() => {
    async function startWebRTC() {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.ontrack = (e) => (videoRef.current.srcObject = e.streams[0]);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`http://${PI_IP}:8889/cam/whep`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription.sdp,
      });

      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    }

    startWebRTC();
  }, []);

  /* Drive */
  const drive = (dir) => {
    fetch(`http://${PI_IP}:3000/api/control/${dir}`, { method: "POST" });

    if (dir === "left")
      setPan((p) => Math.max(p - PAN_STEP, -MAX_PAN));
    if (dir === "right")
      setPan((p) => Math.min(p + PAN_STEP, MAX_PAN));
  };

  const stop = () =>
    fetch(`http://${PI_IP}:3000/api/control/stop`, { method: "POST" });

  return (
    <div className="viewport">
      <video ref={videoRef} autoPlay muted playsInline id="videoPlayer" />

      <div className="hud-overlay">
        <div className="hud-header">
          <div className="glass-card">Mango Rover V1.0</div>
          <div className="glass-card">
            CAM_01 // {clock}
          </div>
        </div>

        <div className="hud-footer">
          <div className="glass-card">
            SIG <span>98%</span> | PWR <span>12.4V</span> | DLAY{" "}
            <span>{latency}ms</span>
          </div>

          <div className="control-cluster">
            {["up", "left", "down", "right"].map((d) => (
              <button
                key={d}
                onMouseDown={() => drive(d)}
                onMouseUp={stop}
              >
                {d.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div
          id="cameraGroup"
          style={{ transform: `rotate(${pan}deg)` }}
        />
      </div>
    </div>
  );
}
