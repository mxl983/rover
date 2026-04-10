import {
  getCpuTemp,
  getWifiSignal,
  getCpuLoad,
  getBatteryPercentage,
} from "../utils/sysUtils.js";
import { getOdometryCalibrationSnapshot } from "../constants/roverOdometry.js";

// Charging detection: battery % goes up >1% in a few seconds = charging; drops >1% = not charging.
// All logic is backend-only; frontend only displays isCharging from health.
const BATTERY_PCT_SAMPLES_MAX = 15;
const BATTERY_PCT_LOOKBACK = 5; // compare to reading from ~5 s ago (battery % is a rolling avg, need longer window)
const CHARGE_UP_PCT = 1;    // battery % rose by at least this many points → charging
const CHARGE_DOWN_PCT = 0.5; // battery % dropped by at least this many points → not charging (responsive to unplug)
const MIN_BASELINE_PCT = 10;  // only treat rise as "charging" if old reading was at least this (ignore 0→x on connect)
const CHARGING_WARMUP_MS = 60 * 1000; // after container restart, battery avg ramps from 0; ignore charging for first 60s

class StateService {
  constructor() {
    this.voltageHistory = [];
    this.HISTORY_SIZE = 20;
    /** @type {{ t: number, pct: number }[]} battery % samples for charging detection */
    this.batteryPctSamples = [];
    /** Last resolved charging state. */
    this._isCharging = false;
    this.currentVoltage = 0;
    this.currentBatteryPct = 0;
    this.distance = 0;
    this.usbPowerState = true;
    this.isShuttingDown = false;
    this.lastPingTimestamp = Date.now();
    this.startupTime = Date.now();
    this.docking = {};
    this.isDockingMode = false;
    this.pan = 90;
    this.tilt = 90;
    this.throttle = 0;
    /** KY-008 laser on GPIO17: true = on, false = off. */
    this.laserOn = false;
    /** When true (default), rover uses slow steady speeds; false = boost (full speed). Unrelated to TTS. */
    this.quietMode = true;
  }

  /** Charging detection: if battery % goes up >1% in a few seconds → charging; if it drops >1% → not charging. */
  getIsCharging() {
    const now = Date.now();
    const pctRaw = this.currentBatteryPct;
    const pct = typeof pctRaw === "string" ? parseFloat(pctRaw) : Number(pctRaw);
    if (!Number.isFinite(pct)) return this._isCharging;

    this.batteryPctSamples.push({ t: now, pct });
    if (this.batteryPctSamples.length > BATTERY_PCT_SAMPLES_MAX) {
      this.batteryPctSamples.shift();
    }
    if (this.batteryPctSamples.length <= BATTERY_PCT_LOOKBACK) return this._isCharging;

    // After container restart, battery avg ramps from 0; don't treat that rise as charging.
    if (now - this.startupTime < CHARGING_WARMUP_MS) {
      return false;
    }

    const newest = this.batteryPctSamples[this.batteryPctSamples.length - 1];
    const old = this.batteryPctSamples[this.batteryPctSamples.length - 1 - BATTERY_PCT_LOOKBACK];
    const change = newest.pct - old.pct;

    // Only set charging when we see a rise from a real baseline (ignore 0→x when dashboard first connects).
    if (change >= CHARGE_UP_PCT && old.pct >= MIN_BASELINE_PCT) {
      this._isCharging = true;
    } else if (change <= -CHARGE_DOWN_PCT) {
      this._isCharging = false;
    }
    return this._isCharging;
  }

  getBatteryPct() {
    this.voltageHistory.push(this.currentVoltage);
    if (this.voltageHistory.length > this.HISTORY_SIZE) {
      this.voltageHistory.shift();
    }
    const sum = this.voltageHistory.reduce((a, b) => a + b, 0);
    const avg = sum / this.voltageHistory.length;
    this.currentBatteryPct = getBatteryPercentage(avg);
    return this.currentBatteryPct;
  }

  getHealth() {
    try {
      return {
        battery: this.getBatteryPct(),
        voltage: this.currentVoltage,
        isCharging: this.getIsCharging(),
        distance: this.distance,
        usbPower: this.usbPowerState ? "on" : "off",
        isShuttingDown: this.isShuttingDown,
        cpuTemp: getCpuTemp(),
        cpuLoad: getCpuLoad(),
        wifiSignal: getWifiSignal(),
        isDockingMode: this.isDockingMode,
        docking: this.docking,
        pan: this.pan,
        tilt: this.tilt,
        throttle: this.throttle,
        laserOn: this.laserOn,
        quietMode: this.quietMode,
        odometry: getOdometryCalibrationSnapshot(this.distance),
      };
    } catch (e) {
      console.log(
        "Hardware stats currently unavailable (Check Docker permissions)" + e,
      );
    }
  }
}

export const stateService = new StateService();
