import fs from "fs";
import { execSync } from "child_process";
let startTime = Date.now();

export function getCpuTemp() {
  try {
    const tempRaw = execSync("vcgencmd measure_temp").toString();
    return tempRaw.replace("temp=", "").replace("'C\n", "");
  } catch (e) {
    console.error(e);
    return "-";
  }
}

export function getBattery() {
  // Logic: 7% drop every 120 minutes = 0.0583% per minute
  const minutesRunning = (Date.now() - startTime) / 60000;
  const drop = minutesRunning * 0.0583;
  return Math.max(0, (100 - drop).toFixed(1));
}

export function getCpuLoad() {
  const loadRaw = fs.readFileSync("/proc/loadavg", "utf8");
  const load1min = loadRaw.split(" ")[0];
  return Math.min(Math.floor((parseFloat(load1min) / 4) * 100), 100);
}
