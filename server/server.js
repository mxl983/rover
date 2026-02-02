const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");

const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// PROXY: Forward video stream requests to MediaMTX
app.use(
  "/video-stream",
  createProxyMiddleware({
    target: "http://mediamtx:8889",
    changeOrigin: true,
    pathRewrite: { "^/video-stream": "" },
  }),
);

// CONTROL: Handle rover movement commands
app.post("/api/control/:direction", (req, res) => {
  const direction = req.params.direction;
  console.log(`Rover command: ${direction}`);

  // TODO: Send command to rover hardware/controller
  // For now, just log it

  res.json({ status: "ok", command: direction });
});

// Simple logic to push status every 2 seconds
setInterval(() => {
  const health = getSystemStats();

  const payload = {
    type: "HEALTH_UPDATE",
    data: {
      ...health,
      batteryEst: calculateBattery(), // Using your 7% logic
      timestamp: new Date().toLocaleTimeString(),
    },
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}, 5000); // 5 seconds is plenty for health checks

wss.on("connection", (ws) => {
  console.log("New browser client connected");

  // THIS is where you listen for messages from THIS specific client
  ws.on("message", (message) => {
    try {
      // Convert Buffer/String to JSON
      const data = JSON.parse(message);
      console.log("Received from client:", data);

      if (data.type === "PING") {
        // Now 'ws' is correctly defined in this scope
        ws.send(JSON.stringify({ type: "PONG" }));
      }
    } catch (err) {
      console.error("Invalid JSON received:", message.toString());
    }
  });

  ws.on("close", () => console.log("Client disconnected"));
});

// app.listen(3000, () => console.log('Server at :3000'));
server.listen(3000, "0.0.0.0", () => {
  console.log("Server running on http://100.x.x.x:3000");
});

// Add this at the top of your file with your other functions
let startTime = Date.now();

function calculateBattery() {
  // Logic: 7% drop every 120 minutes = 0.0583% per minute
  const minutesRunning = (Date.now() - startTime) / 60000;
  const drop = minutesRunning * 0.0583;
  return Math.max(0, (100 - drop).toFixed(1));
}

function getCpuTemp() {
  try {
    // Read directly from the thermal sensor file
    const data = fs.readFileSync(
      "/sys/class/thermal/thermal_zone0/temp",
      "utf8",
    );
    return (parseInt(data) / 1000).toFixed(1); // 45000 -> 45.0
  } catch (e) {
    return "N/A";
  }
}

function getSimpleLoad() {
  // Returns the 1-minute load average
  const load = os.loadavg()[0];
  // Convert to percentage based on 4 cores
  const percentage = Math.min(Math.floor((load / 4) * 100), 100);
  return percentage;
}

function getSystemStats() {
  let stats = {
    cpuTemp: getCpuTemp(),
    camDetected: false,
    throttled: "Stable",
  };
  try {
    // We use try/catch so the server keeps running even if a command fails
    const tempRaw = execSync("vcgencmd measure_temp").toString();
    stats.cpuTemp = tempRaw.replace("temp=", "").replace("'C\n", "");

    const throttleRaw = execSync("vcgencmd get_throttled").toString();
    stats.throttled = throttleRaw.includes("0x0") ? "Stable" : "Low Power!";

    // 2. Read CPU Load (Simplified version)
    const loadRaw = fs.readFileSync("/proc/loadavg", "utf8");
    const load1min = loadRaw.split(" ")[0];
    stats.cpuLoad = Math.min(Math.floor((parseFloat(load1min) / 4) * 100), 100);
  } catch (e) {
    // If vcgencmd still isn't found, we'll see this in logs but server won't crash
    console.log(
      "Hardware stats currently unavailable (Check Docker permissions)",
    );
  }
  return stats;
}
