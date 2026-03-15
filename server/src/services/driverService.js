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
  env: {
    ...process.env,
    BLINKA_FORCEBOARD: process.env.BLINKA_FORCEBOARD || "RASPBERRY_PI_3B",
    BLINKA_FORCECHIP: process.env.BLINKA_FORCECHIP || "BCM2XXX",
  },
};

class DriverService {
  constructor() {
    this.motorShell = null;
    this.telemetryShell = null;
    this.currentData = { voltage: 0, distance: 0 };
    this.broadcast = () => {};
  }

  setBroadcast(fn) {
    this.broadcast = fn || (() => {});
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
          this.currentData.pan = data.pan;
          this.currentData.tilt = data.tilt;
          console.log(`📸 Camera at: Pan ${data.pan}°, Tilt ${data.tilt}°`);
          stateService.pan = data.pan;
          stateService.tilt = data.tilt;
        }

        if (data.type === "throttle_update") {
          const throttle = data.throttle ?? 0;
          stateService.throttle = throttle;
          this.broadcast({ type: "THROTTLE_UPDATE", data: { throttle } });
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

    this.motorShell.on("close", (code, signal) => {
      this.motorShell = null;
      if (code !== 0 && code !== null) {
        console.warn("🐍 Motor process exited (code=%s). Drive commands will no-op until restart.", code);
      }
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

  sync() {
    this.requestTelemetry();
  }
}

export const driverService = new DriverService();
