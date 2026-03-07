import { PythonShell } from "python-shell";
import path from "path";
import { fileURLToPath } from "url";
import { AutoDocker } from "./autoDocker.js";
import { stateService } from "./stateService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "../../");

const options = {
  mode: "text",
  pythonPath: process.env.PYTHON_PATH || "/usr/bin/python3",
  pythonOptions: ["-u"],
  scriptPath: SCRIPT_PATH,
};

class DriverService {
  constructor() {
    this.motorShell = null;
    this.telemetryShell = null;
    this.visionShell = null;
    this.currentData = { voltage: 0, distance: 0, docking: {} };
  }

  start() {
    this.initMotor();
    this.initTelemetry();
    this.autoDocker = new AutoDocker((keys) => {
      console.log(`I try to move rover myself: ${keys}`);
      if (this.motorShell) {
        this.motorShell.send(JSON.stringify(keys));
      }
    });
  }

  initMotor() {
    this.motorShell = new PythonShell("driver/RoverDriver.py", options);

    this.motorShell.on("message", (message) => {
      try {
        const data = JSON.parse(message);

        // 1. Handle Real-time Servo Angle Updates
        if (data.type === "servo_update") {
          // Update local state
          this.currentData.pan = data.pan;
          this.currentData.tilt = data.tilt;

          // OPTIONAL: If using Socket.io, emit to frontend here
          // this.io.emit('servo_state', { pan: data.pan, tilt: data.tilt });

          console.log(`📸 Camera at: Pan ${data.pan}°, Tilt ${data.tilt}°`);
          stateService.pan = data.pan;
          stateService.tilt = data.tilt;
        }

        // 2. Handle the "Ready" status from __main__
        if (data.status === "ready") {
          console.log("✅ Rover Python Driver is online and calibrated.");
        }

        // 3. Handle informational messages
        if (data.status === "info") {
          console.info("🐍 Python Info:", data.message);
        }
      } catch (e) {
        // Catch non-JSON strings (like manual print statements or bugs)
        console.log("🐍 Raw Python Output:", message);
      }
    });

    this.motorShell.on("stderr", (err) => {
      console.error("🐍 Motor STDERR:", err);
    });

    this.motorShell.on("error", (err) => {
      console.error("❌ Motor CRASH:", err);
    });
  }

  initTelemetry() {
    this.telemetryShell = new PythonShell(
      "driver/TelemetryMonitor.py",
      options,
    );

    this.telemetryShell.on("message", (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === "telemetry") {
          stateService.currentVoltage = data.voltage;
          stateService.distance = data.distance || 0;
        }
      } catch (e) {
        console.error("Voltage Parse Error", e);
      }
    });
  }

  initVision() {
    const visionOptions = { ...options, pythonOptions: ["-u"] };
    this.visionShell = new PythonShell(
      "vision/VisionManager.py",
      visionOptions,
    );

    this.visionShell.on("message", (data) => {
      const result = JSON.parse(data);
      if (result.type === "docking") {
        stateService.docking = result.result;
        // if (this.currentData.docking.status === "found") {
        //   const offset = computePoseOffset(this.currentData.docking.data.pose);
        //   this.autoDocker.processOffset(offset);
        // }
      }
    });

    this.visionShell.on("error", (err) =>
      console.error("👁️ Vision Error:", err),
    );

    this.visionShell.on("stderr", (err) => {
      console.error("🐍 Vision STDERR:", err);
    });
  }

  sendMoveCommand(keys) {
    if (this.motorShell) {
      this.motorShell.send(JSON.stringify(keys));
    }
  }

  requestTelemetry() {
    if (this.telemetryShell) {
      this.telemetryShell.send(JSON.stringify({ command: "get_telemetry" }));
    }
  }

  getTelemetry() {
    return this.currentData;
  }

  requestDockingStatus() {
    if (this.visionShell) {
      this.visionShell.send(JSON.stringify({ command: "get_docking_status" }));
    }
  }

  stopVisionSystem() {
    if (this.visionShell) {
      this.visionShell.send(JSON.stringify({ command: "stop_vision" }));
    }
  }

  toggleDockingMode(enabled) {
    if (enabled) {
      if (!this.visionShell) {
        console.log("🚀 Starting Docking Mode...");
        this.initVision(); // This spawns the Python process
      }
    } else {
      if (this.visionShell) {
        console.log("🛑 Stopping Docking Mode...");
        this.visionShell.send(JSON.stringify({ command: "stop_vision" }));
        this.visionShell.end();
        this.visionShell = null;
        this.currentData.docking = { status: "off" }; // Clear dashboard data
      }
    }
  }

  sync() {
    this.requestTelemetry();
    this.requestDockingStatus();
  }
}

export const driverService = new DriverService();
