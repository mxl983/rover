import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { getCpuTemp, getBattery, getCpuLoad } from "./utils/sysUtils.js"; // Note the .js extension
import { PythonShell } from "python-shell";
import cors from "cors";

let options = {
  mode: "text",
  pythonPath: "/usr/bin/python3", // Use the absolute path here
  pythonOptions: ["-u"], // get print results in real-time
};

let pyShell = new PythonShell("driver/RoverDriver.py", options);
pyShell.on("message", function (message) {
  // This is where your Python prints will show up!
  console.log("PYTHON_LOG:", message);
});

const app = express();

// Enable CORS for all routes
app.use(cors());

// Ensure you can parse JSON bodies
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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

app.post("/api/control/drive", (req, res) => {
  const { keys } = req.body;

  // Send the array of keys (e.g., ["w", "d"]) to the Python script via stdin
  if (pyShell) {
    console.log("Py shell ready");
    pyShell.send(JSON.stringify(keys));
  } else {
    console.log("No shell!!");
  }

  res.sendStatus(200);
});

// Handler for Battery Voltage
app.get("/api/telemetry/voltage", (req, res) => {
  if (pyVoltageShell) {
    // Listen for the next message from the voltage script
    pyVoltageShell.once("message", (message) => {
      try {
        const data = JSON.parse(message);
        res.status(200).json(data);
      } catch (e) {
        res.status(500).json({ error: "Failed to parse voltage data" });
      }
    });

    // Send the trigger command to Python
    pyVoltageShell.send(JSON.stringify({ command: "get_voltage" }));
  } else {
    res.status(503).json({ error: "Voltage service not available" });
  }
});

// Handler for Distance Traveled
app.get("/api/telemetry/distance", (req, res) => {
  if (pyDistanceShell) {
    pyDistanceShell.once("message", (message) => {
      try {
        const data = JSON.parse(message);
        res.status(200).json(data);
      } catch (e) {
        res.status(500).json({ error: "Failed to parse distance data" });
      }
    });

    pyDistanceShell.send(JSON.stringify({ command: "get_distance" }));
  } else {
    res.status(503).json({ error: "Distance service not available" });
  }
});

setInterval(() => {
  const health = getSystemStats();

  const payload = {
    type: "HEALTH_UPDATE",
    data: {
      ...health,
      batteryEst: getBattery(),
      timestamp: new Date().toLocaleTimeString(),
    },
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}, 5000);

wss.on("connection", (ws) => {
  console.log("New browser client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "PING") {
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

function getSystemStats() {
  let stats = {
    cpuTemp: getCpuTemp(),
    camDetected: false,
    throttled: "Stable",
  };
  try {
    stats.cpuTemp = getCpuTemp();
    stats.cpuLoad = getCpuLoad();
    stats.battery = getBattery();
  } catch (e) {
    // If vcgencmd still isn't found, we'll see this in logs but server won't crash
    console.log(
      "Hardware stats currently unavailable (Check Docker permissions)",
    );
  }
  return stats;
}
