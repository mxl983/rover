import express from "express";
import https from "https";
import { WebSocketServer, WebSocket } from "ws";
import { getCpuTemp, getBattery, getCpuLoad } from "./utils/sysUtils.js"; // Note the .js extension
import { PythonShell } from "python-shell";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import axios from "axios";

const sslOptions = {
  // These paths match the volume mounts in your docker-compose.yml
  key: fs.readFileSync("/cert.key"),
  cert: fs.readFileSync("/cert.crt"),
};

// Reconstruct __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 2. Capture Tracebacks and Exceptions (CRITICAL)
pyShell.on("stderr", function (stderr) {
  console.error("PYTHON_ERROR_STREAM:", stderr);
});

// 3. Capture process-level errors (like script not found or crash)
pyShell.on("error", function (err) {
  console.error("PYTHON_CRITICAL_FAIL:", err);
});

pyShell.on("close", (code, signal) => {
  console.error(
    `PYTHON_CRASH: Process exited with code ${code} and signal ${signal}`,
  );
});

const voltageShell = new PythonShell("driver/VoltageMonitor.py", options);

let currentBatteryPct = 0;
let currentVoltage = 0;
let distance = 0;
let isCharging = false;
const voltageHistory = [];
const HISTORY_SIZE = 20;

voltageShell.on("message", (message) => {
  try {
    const data = JSON.parse(message);
    if (data.type === "voltage" && data.value) {
      // 1. Add new reading to history
      voltageHistory.push(data.value);
      currentVoltage = data.value;

      // 2. Keep history size fixed (remove oldest)
      if (voltageHistory.length > HISTORY_SIZE) {
        voltageHistory.shift();
      }

      // 3. Calculate Average
      const sum = voltageHistory.reduce((a, b) => a + b, 0);
      const avgVoltage = sum / voltageHistory.length;

      // 4. Update the global percentage based on AVERAGE
      currentBatteryPct = calculatePercentage(avgVoltage);
      distance = data?.distance || 0;
    }
  } catch (err) {
    console.error("Failed to parse voltage data:", err);
  }
});

// 2. Capture Tracebacks and Exceptions (CRITICAL)
voltageShell.on("stderr", function (stderr) {
  console.error("PYTHON_ERROR_STREAM:", stderr);
});

// 3. Capture process-level errors (like script not found or crash)
voltageShell.on("error", function (err) {
  console.error("PYTHON_CRITICAL_FAIL:", err);
});

voltageShell.on("close", (code, signal) => {
  console.error(
    `PYTHON_CRASH: Process exited with code ${code} and signal ${signal}`,
  );
});

const app = express();
app.use(express.json());

const server = https.createServer(sslOptions, app);
const wss = new WebSocketServer({ server });

// Enable CORS for all routes
const corsOptions = {
  origin: [
    "http://localhost:5173", // Your local Vite dev server
    "https://mxl983.github.io", // Your production dashboard
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
};

app.use(cors(corsOptions));

// IMPORTANT: Add this specific handler for OPTIONS (Preflight) requests
// app.options("/*path", cors(corsOptions));
app.options(/(.*)/, cors(corsOptions));

// --- SECURE SERVER SETUP ---

const execPromise = util.promisify(exec);

app.post("/api/camera/capture", async (req, res) => {
  const fileName = `capture_${Date.now()}.jpg`;
  const filePath = `/app/photos/${fileName}`;

  try {
    console.log("📸 Blinking: Stopping video stream...");
    // 1. Pause the MediaMTX container
    await execPromise("DOCKER_API_VERSION=1.44 docker stop mediamtx");

    console.log("🔭 Taking 4K High-Res Photo...");
    // 2. Capture the high-res photo
    // -n: no preview, --immediate: don't wait for focus/exposure circles
    await execPromise(
      `rpicam-still -n -o "${filePath}" --width 4056 --height 3040 --immediate --flush`,
    );

    console.log("✅ Photo saved. Restarting stream...");

    const photoUrl = `${req.protocol}://${req.get("host")}/photos/${fileName}`;

    res.json({
      status: "success",
      url: photoUrl,
      filename: fileName,
    });
  } catch (error) {
    console.error("Capture Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    // 3. Always restart the stream, even if the photo fails
    exec("DOCKER_API_VERSION=1.44 docker start mediamtx", (err) => {
      if (err) console.error("Failed to restart MediaMTX:", err);
      else console.log("▶️ Stream resumed.");
    });
  }
});

app.post("/api/system/shutdown", (req, res) => {
  // Create the "trigger" file in the shared volume
  const triggerPath = "/app/shared/shutdown.req";
  fs.writeFileSync(
    triggerPath,
    "shutdown requested at " + new Date().toISOString(),
  );

  res.json({ message: "Host shutdown signal sent to Pi." });
});

app.post("/api/system/reboot", (req, res) => {
  try {
    // Create the "reboot" trigger file in the shared volume
    fs.writeFileSync("/app/shared/reboot.req", "rebooting");
    res.json({ message: "Host reboot sequence initiated." });
  } catch (err) {
    res.status(500).json({ error: "Failed to write signal file" });
  }
});

app.post("/api/camera/nightvision", async (req, res) => {
  const { active, secret } = req.body;
  if (secret !== "rover-alpha-99") return res.status(401).send("Unauthorized");

  // Prepare the payload based on your low-light tuning
  const config = active
    ? {
        rpiCameraShutter: 66000,
        rpiCameraGain: 8.0,
        rpiCameraBrightness: 0.2,
        rpiCameraContrast: 1.2,
      }
    : {
        rpiCameraShutter: 0, // 0 = Auto
        rpiCameraGain: 0, // 0 = Auto
        rpiCameraBrightness: 0,
        rpiCameraContrast: 1.0,
      };

  try {
    // We PATCH the 'cam' path configuration.
    // Note: Replace 'cam' with whatever your path is called in mediamtx.yml
    const MEDIAMTX_API = "http://127.0.0.1:9997/v3/config/paths/patch/cam";
    await axios.patch(MEDIAMTX_API, config);

    res.json({ message: `Night Vision ${active ? "Enabled" : "Disabled"}` });
  } catch (err) {
    console.error("MediaMTX API Error:", err.message);
    res.status(500).json({ error: "Failed to update camera settings" });
  }
});

app.post("/api/camera/focus", async (req, res) => {
  const { mode, secret } = req.body; // 'auto', 'near', 'normal', 'far'
  if (secret !== "rover-alpha-99") return res.status(401).send("Unauthorized");

  let settings = {};

  if (mode === "auto") {
    settings = {
      rpiCameraAfMode: "continuous",
    };
  } else {
    // Switch to manual to hold a specific position
    settings = {
      rpiCameraAfMode: "manual",
      rpiCameraLensPosition:
        mode === "near" ? 10.0 : mode === "normal" ? 5.0 : 0.0,
    };
  }

  try {
    await axios.patch(
      "http://127.0.0.1:9997/v3/config/paths/patch/cam",
      settings,
    );
    res.json({ message: `Focus set to ${mode}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to apply focus" });
  }
});

app.post("/api/camera/resolution", async (req, res) => {
  const { mode, secret } = req.body;
  if (secret !== "rover-alpha-99") return res.status(401).send("Unauthorized");

  const resMap = {
    "240p": { width: 320, height: 240, fps: 60 },
    "480p": { width: 640, height: 480, fps: 60 },
    "720p": { width: 1280, height: 720, fps: 60 },
    "1080p": { width: 1920, height: 1080, fps: 15 },
  };

  const target = resMap[mode] || resMap["720p"];

  const settings = {
    rpiCameraWidth: target.width,
    rpiCameraHeight: target.height,
  };

  try {
    await axios.patch(
      "http://127.0.0.1:9997/v3/config/paths/patch/cam",
      settings,
    );
    res.json({ message: `Resolution changed to ${mode}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to apply resolution" });
  }
});

app.post("/api/camera/settings", async (req, res) => {
  const { settings, secret } = req.body; // e.g., { rpiCameraWidth: 1920, rpiCameraHeight: 1080 }

  try {
    await axios.patch(
      "http://127.0.0.1:9997/v3/config/paths/patch/cam",
      settings,
    );
    res.json({ message: "Settings applied" });
  } catch (err) {
    res.status(500).send("API Error");
  }
});

// Make sure your photos folder is served statically so you can view them
app.use("/photos", express.static(path.join(__dirname, "photos")));

app.post("/api/control/drive", (req, res) => {
  const { keys } = req.body;
  // Send the array of keys (e.g., ["w", "d"]) to the Python script via stdin
  if (pyShell) {
    pyShell.send(JSON.stringify(keys));
  } else {
    console.log("No shell!!");
  }

  res.sendStatus(200);
});

setInterval(() => {
  const health = getSystemStats();

  const payload = {
    type: "HEALTH_UPDATE",
    data: {
      ...health,
      timestamp: new Date().toLocaleTimeString(),
    },
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });

  voltageShell.send(JSON.stringify({ command: "get_voltage" }));
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

server.listen(3000, "0.0.0.0", () => {
  console.log("Server running on https://100.x.x.x:3000");
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
    stats.battery = currentBatteryPct;
    stats.voltage = currentVoltage;
    stats.distance = distance;
  } catch (e) {
    // If vcgencmd still isn't found, we'll see this in logs but server won't crash
    console.log(
      "Hardware stats currently unavailable (Check Docker permissions)",
    );
  }
  return stats;
}

// Helper: 3S LiPo Voltage mapping
function calculatePercentage(v) {
  const max = 12.6;
  const min = 9;
  const pct = ((v - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct)).toFixed(1);
}
