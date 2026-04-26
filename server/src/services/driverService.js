import { PythonShell } from "python-shell";
import path from "path";
import { fileURLToPath } from "url";
import { AutoDocker } from "./autoDocker.js";
import { stateService } from "./stateService.js";
import { playSystemAudio, speak } from "../utils/sysUtils.js";
import { logger } from "../utils/logger.js";

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

export class DriverService {
  constructor() {
    this.motorShell = null;
    this.telemetryShell = null;
    this.currentData = { voltage: 0, distance: 0 };
    this.broadcast = () => {};
    /** @type {((n: number) => void) | null} */
    this._distanceFreshResolve = null;
    this._distanceFreshTimer = null;
  }

  setBroadcast(fn) {
    this.broadcast = fn || (() => {});
  }

  start() {
    this.initMotor();
    this.initTelemetry();
    this.autoDocker = new AutoDocker((keys) => {
      console.log(`I try to move rover myself: ${keys}`);
      if (!this.motorShell) return;
      try {
        this.motorShell.send(JSON.stringify(keys));
      } catch (err) {
        if (err.code !== "EPIPE") console.warn("Motor send error:", err.message);
        this.motorShell = null;
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

        if (data.type === "laser_update") {
          stateService.laserOn = Boolean(data.on);
          this.broadcast({ type: "LASER_UPDATE", data: { laserOn: stateService.laserOn } });
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
          const parsedVoltage = Number(data.voltage);
          stateService.currentVoltage = Number.isFinite(parsedVoltage) ? parsedVoltage : 0;
          const parsedVoltageRaw = Number(data.voltageRaw);
          stateService.currentVoltageRaw = Number.isFinite(parsedVoltageRaw) ? parsedVoltageRaw : null;
          stateService.distance = data.distance || 0;
          if (this._distanceFreshResolve) {
            if (this._distanceFreshTimer) {
              clearTimeout(this._distanceFreshTimer);
              this._distanceFreshTimer = null;
            }
            const resolve = this._distanceFreshResolve;
            this._distanceFreshResolve = null;
            resolve(Number(stateService.distance) || 0);
          }
        }
      } catch (e) {
        console.error("Voltage Parse Error", e);
      }
    });

    this.telemetryShell.on("error", (err) => {
      console.warn("🐍 Telemetry process error:", err.message || err);
      this.telemetryShell = null;
    });

    this.telemetryShell.on("close", (code, signal) => {
      this.telemetryShell = null;
      if (code !== 0 && code !== null) {
        console.warn("🐍 Telemetry process exited (code=%s). Voltage/distance will stale until restart.", code);
      }
    });
  }

  sendMoveCommand(keys) {
    if (
      keys &&
      typeof keys === "object" &&
      !Array.isArray(keys) &&
      typeof keys.command === "string" &&
      keys.command.toLowerCase() === "meow"
    ) {
      logger.info("Drive command meow: playing clip then TTS 芒果×2");
      playSystemAudio("meow.mp3", () => {
        // Edge default volume can be quiet after SFX; short phrase says the name twice.
        speak("芒果，芒果", { language: "zh", volume: "+5%" });
      });
      return;
    }
    if (!this.motorShell) return;
    try {
      this.motorShell.send(JSON.stringify(keys));
    } catch (err) {
      if (err.code !== "EPIPE") console.warn("Motor send error:", err.message);
      this.motorShell = null;
    }
  }

  requestTelemetry() {
    if (!this.telemetryShell) return;
    try {
      this.telemetryShell.send(JSON.stringify({ command: "get_telemetry" }));
    } catch (err) {
      if (err.code !== "EPIPE") console.warn("Telemetry send error:", err.message);
      this.telemetryShell = null;
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
