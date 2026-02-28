import {
  getCpuTemp,
  getWifiSignal,
  getCpuLoad,
  getBatteryPercentage,
} from "../utils/sysUtils.js";

class StateService {
  constructor() {
    this.voltageHistory = [];
    this.HISTORY_SIZE = 20;
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
      };
    } catch (e) {
      console.log(
        "Hardware stats currently unavailable (Check Docker permissions)" + e,
      );
    }
  }
}

export const stateService = new StateService();
