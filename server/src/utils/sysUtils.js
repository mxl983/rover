import fs from "fs";
import { execSync, spawn } from "child_process";
import playerPkg from "play-sound";
import path from "path";

/**
 * Speak text on the Pi speaker using espeak-ng (TTS) piped to aplay.
 * In Docker with /dev/snd, espeak-ng's direct ALSA output often fails; piping to aplay fixes that.
 * With USB speakers, set TTS_ALSA_DEVICE (e.g. plughw:1,0). Voice: TTS_VOICE env or options.voice
 * (e.g. "en+f1" = English female, "en" = male, "cmn" = Mandarin; run "espeak-ng --voices" for list).
 * @param {string} text - Text to speak (e.g. "System online")
 * @param {object} options - Optional: { speed: 150, voice: 'en+f1', amplitude: 150 } (amplitude 0–200, default 150)
 */
export function speak(text, options = {}) {
  const speed = options.speed ?? 150;
  const voice = options.voice ?? process.env.TTS_VOICE ?? "en+f1";
  const amplitude = options.amplitude ?? (Number(process.env.TTS_AMPLITUDE) || 150);
  const args = ["-w", "stdout", "-s", String(speed), "-a", String(amplitude), "-v", voice, "--stdin"];
  const espeak = spawn("espeak-ng", args, {
    stdio: ["pipe", "pipe", "ignore"],
  });
  const device = process.env.TTS_ALSA_DEVICE || "default";
  const aplayArgs = device === "default" ? ["-q"] : ["-D", device, "-q"];
  const aplay = spawn("aplay", aplayArgs, {
    stdio: ["pipe", "ignore", "ignore"],
  });
  espeak.stdout.pipe(aplay.stdin);
  espeak.stdout.on("error", (err) => {
    if (err.code !== "EPIPE") console.warn("TTS (espeak-ng stdout):", err.message);
  });
  aplay.stdin.on("error", (err) => {
    if (err.code !== "EPIPE") console.warn("TTS (aplay stdin):", err.message);
  });
  espeak.on("error", (err) => {
    console.warn("TTS (espeak-ng) unavailable:", err.message);
  });
  aplay.on("error", (err) => {
    console.warn("TTS (aplay) unavailable:", err.message);
  });
  aplay.on("close", (code) => {
    if (code && code !== 0) {
      console.warn("TTS (aplay) exited with code", code);
    }
    aplay.stdin.end();
  });
  espeak.on("close", (code) => {
    if (code && code !== 0) {
      console.warn("TTS (espeak-ng) exited with code", code);
    }
    aplay.stdin.end();
  });
  espeak.stdin.write(text, "utf8");
  espeak.stdin.end();
}

const player = playerPkg({ player: "mpg123" });

let startTime = Date.now();

const targetPoseRecord = {
  x: -7.68,
  y: -3.99,
  z: 84.63,
  yaw: -3.65,
};

export function getWifiSignal() {
  try {
    // Executes the command and captures the output
    const cmd = "iwconfig wlan0 | grep 'Signal level'";
    const output = execSync(cmd).toString();

    // Uses Regex to find the "-XX dBm" part
    const match = output.match(/Signal level=(-?\d+) dBm/);

    if (match && match[1]) {
      return parseInt(match[1]); // Returns -30, -50, etc.
    }
    return 0;
  } catch (e) {
    // If wlan0 doesn't exist (like on Ethernet), return 0
    return 0;
  }
}

export function getCpuTemp() {
  try {
    const tempRaw = execSync("vcgencmd measure_temp").toString();
    return tempRaw.replace("temp=", "").replace("'C\n", "");
  } catch (e) {
    console.error(e);
    return "-";
  }
}

export function getBatteryPercentage(voltage) {
  const vMax = 12.3;
  const vMin = 9.0;

  // Calculate percentage based on the range
  let percentage = ((voltage - vMin) / (vMax - vMin)) * 100;

  // Constrain between 0 and 100
  if (percentage > 100) percentage = 100;
  if (percentage < 0) percentage = 0;

  return percentage.toFixed(1);
}

export function getCpuLoad() {
  const loadRaw = fs.readFileSync("/proc/loadavg", "utf8");
  const load1min = loadRaw.split(" ")[0];
  return Math.min(Math.floor((parseFloat(load1min) / 4) * 100), 100);
}

export const computePoseOffset = (
  currentPose,
  targetPose = targetPoseRecord,
) => {
  if (!currentPose || !targetPose) return null;

  // Depth (y): Current Distance minus Target Distance
  // If current is 10cm and target is 30cm, y = -20 (We need to move BACK)
  const y = currentPose.z - targetPose.z;

  // Lateral (x):
  const x = currentPose.x - targetPose.x;

  // Rotation (r):
  let r = currentPose.yaw - targetPose.yaw;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;

  return { x, y, r };
};

/**
 * Plays an audio file from the container's mounted audio directory.
 * @param {string} filename - The name of the file (e.g., 'system_online.mp3')
 */
export function playSystemAudio(filename) {
  const filePath = path.join("/app/audios", filename);

  player.play(filePath, (err) => {
    if (err) {
      console.error(`Playback error: ${err.message}`);
    } else {
      console.log(`Finished playing: ${filename}`);
    }
  });
}
