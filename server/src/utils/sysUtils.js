import fs from "fs";
import { execSync, spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __sysUtilsDir = path.dirname(fileURLToPath(import.meta.url));

/** System clips (meow.mp3, etc.): repo `server/audios`, or `/app/audios` in Docker. Override with AUDIO_ASSETS_DIR. */
function audioAssetsDir() {
  const fromEnv = String(process.env.AUDIO_ASSETS_DIR || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(__sysUtilsDir, "../../audios");
}

/** Ordered `aplay` argv lists for WAV playback (USB / dmix / explicit PCM). */
function aplayAttemptArgLists(wavPath) {
  const d = String(process.env.TTS_ALSA_DEVICE || "default").trim() || "default";
  const roverPcm = String(process.env.ROVER_ALSA_PLAYBACK_PCM || "rover_play").trim();
  const fb = String(process.env.APLAY_DEVICE_FALLBACK || "plughw:3,0").trim();
  const extra = String(process.env.APLAY_EXTRA_DEVICES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const lists = [];
  if (roverPcm) lists.push(["-D", roverPcm, "-q", wavPath]);
  lists.push(["-q", wavPath]);
  lists.push(["-D", "default", "-q", wavPath]);
  if (d !== "default") lists.push(["-D", d, "-q", wavPath]);
  for (const dev of extra) lists.push(["-D", dev, "-q", wavPath]);
  if (fb && fb !== "default" && fb !== d && !extra.includes(fb)) {
    lists.push(["-D", fb, "-q", wavPath]);
  }
  const seen = new Set();
  return lists.filter((args) => {
    const key = args.join("\0");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runAplayAttempts(wavPath, onComplete) {
  const lists = aplayAttemptArgLists(wavPath);
  const run = (idx) => {
    if (idx >= lists.length) {
      const err = new Error(
        `aplay could not play ${path.basename(wavPath)} (${lists.length} attempts)`,
      );
      console.error(err.message);
      if (typeof onComplete === "function") onComplete(err);
      return;
    }
    const args = lists[idx];
    const child = spawn("aplay", args, { stdio: ["ignore", "ignore", "pipe"] });
    let errBuf = "";
    child.stderr?.on("data", (c) => {
      errBuf += c.toString();
    });
    child.on("error", (err) => {
      console.warn("Playback (aplay):", err.message);
      run(idx + 1);
    });
    child.on("close", (code) => {
      if (code && code !== 0) {
        const tail = errBuf.trim().slice(0, 240);
        console.warn(
          `Playback (aplay ${args.slice(0, 3).join(" ")}) exited with code ${code}`,
          tail ? `: ${tail}` : "",
        );
        run(idx + 1);
        return;
      }
      console.log(`Finished playing (aplay): ${path.basename(wavPath)}`);
      if (typeof onComplete === "function") onComplete(null);
    });
  };
  run(0);
}

/**
 * Play .wav or .mp3: always **decode then aplay** (or aplay WAV directly).
 * Bare `mpg123 file.mp3` often exits 0 while sending audio to HDMI or a sink you are not listening to.
 */
function playFileWithMpg123Attempts(filePath, onComplete) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav") {
    runAplayAttempts(filePath, onComplete);
    return;
  }

  const tmpWav = path.join(
    "/tmp",
    `rover-decode-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`,
  );
  const dec = spawn("mpg123", ["-q", "-w", tmpWav, filePath], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let decErr = "";
  dec.stderr?.on("data", (c) => {
    decErr += c.toString();
  });
  dec.on("error", (err) => {
    console.warn("Playback (mpg123 -w decode):", err.message);
    if (typeof onComplete === "function") onComplete(err);
  });
  dec.on("close", (decCode) => {
    if (decCode && decCode !== 0) {
      console.warn(
        `Playback (mpg123 -w decode) exited with code ${decCode}`,
        decErr.trim().slice(0, 240),
      );
      if (typeof onComplete === "function") {
        onComplete(new Error(`mpg123 decode failed (${decCode})`));
      }
      return;
    }
    runAplayAttempts(tmpWav, (aplayErr) => {
      fs.unlink(tmpWav, () => {});
      if (typeof onComplete === "function") onComplete(aplayErr);
    });
  });
}

let cachedZhVoice = null;
let loggedZhVoice = false;
let piperAvailableCache = null;
/** Once edge-tts imports cleanly, keep using it (avoid re-probing every utterance). */
let edgeTtsImportOk = false;
/** After a failed/timeout probe, wait before trying again (slow SD / busy CPU caused false negatives). */
let edgeTtsRetryAfter = 0;
let loggedMandarinEspeakFallback = false;

function isEdgeTtsAvailable() {
  if (edgeTtsImportOk) return true;
  if (Date.now() < edgeTtsRetryAfter) return false;
  try {
    const probe = spawnSync(
      "python3",
      ["-c", "import edge_tts"],
      {
        stdio: "ignore",
        timeout: 12000,
      },
    );
    if (probe.status === 0) {
      edgeTtsImportOk = true;
      return true;
    }
  } catch {
    // e.g. probe timeout — do not treat as permanent "no edge-tts"
  }
  edgeTtsRetryAfter = Date.now() + 120_000;
  return false;
}

function isPiperAvailable() {
  if (piperAvailableCache != null) return piperAvailableCache;
  const piperBin = String(process.env.PIPER_BIN || "piper").trim() || "piper";
  try {
    const probe = spawnSync(piperBin, ["--help"], {
      stdio: "ignore",
      timeout: 8000,
    });
    piperAvailableCache = probe.status === 0;
  } catch {
    piperAvailableCache = false;
  }
  return piperAvailableCache;
}

function pickBestMandarinVoice() {
  if (cachedZhVoice) return cachedZhVoice;

  // Allow explicit override from env when user has a preferred installed voice.
  const forced = String(process.env.TTS_ZH_VOICE || "").trim();
  if (forced) {
    cachedZhVoice = forced;
    return cachedZhVoice;
  }

  try {
    const output = execSync("espeak-ng --voices", { encoding: "utf8" });
    const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);
    const candidates = lines
      .map((line) => {
        const parts = line.split(/\s+/u);
        // espeak-ng --voices columns typically end with the voice name.
        return parts[parts.length - 1] || "";
      })
      .filter(Boolean);

    // Prefer clearer Mandarin/Chinese voices first.
    const preferred = [
      "zh",
      "zh-cn",
      "cmn",
      "zhy",
      "zh-yue",
      "yue",
      "zh+f3",
      "zh+f2",
      "zh+f1",
    ];
    const lowerCandidates = candidates.map((v) => v.toLowerCase());
    for (const pref of preferred) {
      const idx = lowerCandidates.findIndex((v) => v === pref || v.startsWith(`${pref}+`));
      if (idx >= 0) {
        cachedZhVoice = candidates[idx];
        return cachedZhVoice;
      }
    }

    // Broad fallback: anything that looks Chinese-related.
    const broadIdx = lowerCandidates.findIndex((v) => /(^zh|cmn|yue|mandarin)/u.test(v));
    if (broadIdx >= 0) {
      cachedZhVoice = candidates[broadIdx];
      return cachedZhVoice;
    }
  } catch (err) {
    console.warn("TTS voice scan failed:", err.message);
  }

  // Last fallback if no Chinese voice is listed by espeak-ng.
  cachedZhVoice = "zh";
  return cachedZhVoice;
}

function speakWithPiper(text, options = {}) {
  if (!isPiperAvailable()) return false;
  const piperBin = String(process.env.PIPER_BIN || "piper").trim() || "piper";
  const model = String(
    options.model
      || process.env.PIPER_MODEL_PATH
      || "/app/tts/zh_CN-huayan-medium.onnx",
  ).trim();
  if (!model) {
    console.warn("TTS (piper) missing model path");
    return false;
  }

  const sampleRate = Number(options.sampleRate || process.env.PIPER_SAMPLE_RATE || 22050);
  const speaker = options.speaker ?? process.env.PIPER_SPEAKER;
  const noiseScale = options.noiseScale ?? process.env.PIPER_NOISE_SCALE;
  const lengthScale = options.lengthScale ?? process.env.PIPER_LENGTH_SCALE;
  const noiseW = options.noiseW ?? process.env.PIPER_NOISE_W;

  const args = ["--model", model, "--output-raw"];
  if (speaker != null && String(speaker).trim() !== "") {
    args.push("--speaker", String(speaker).trim());
  }
  if (noiseScale != null && String(noiseScale).trim() !== "") {
    args.push("--noise_scale", String(noiseScale).trim());
  }
  if (lengthScale != null && String(lengthScale).trim() !== "") {
    args.push("--length_scale", String(lengthScale).trim());
  }
  if (noiseW != null && String(noiseW).trim() !== "") {
    args.push("--noise_w", String(noiseW).trim());
  }

  const piper = spawn(piperBin, args, {
    stdio: ["pipe", "pipe", "ignore"],
  });
  const device = process.env.TTS_ALSA_DEVICE || "default";
  const aplayArgs = device === "default"
    ? ["-q", "-r", String(sampleRate), "-f", "S16_LE", "-t", "raw"]
    : ["-D", device, "-q", "-r", String(sampleRate), "-f", "S16_LE", "-t", "raw"];
  const aplay = spawn("aplay", aplayArgs, {
    stdio: ["pipe", "ignore", "ignore"],
  });

  piper.stdout.pipe(aplay.stdin);
  piper.stdout.on("error", (err) => {
    if (err.code !== "EPIPE") console.warn("TTS (piper stdout):", err.message);
  });
  aplay.stdin.on("error", (err) => {
    if (err.code !== "EPIPE") console.warn("TTS (aplay stdin):", err.message);
  });
  piper.on("error", (err) => {
    console.warn("TTS (piper) unavailable:", err.message);
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
  piper.on("close", (code) => {
    if (code && code !== 0) {
      console.warn("TTS (piper) exited with code", code);
    }
    aplay.stdin.end();
  });
  piper.stdin.write(text, "utf8");
  piper.stdin.end();
  return true;
}

function speakWithEdge(text, options = {}) {
  if (!isEdgeTtsAvailable()) return false;
  const voice = String(
    options.voice
      || process.env.EDGE_TTS_VOICE
      || "zh-CN-XiaoxiaoNeural",
  ).trim();
  const rate = String(options.rate || process.env.EDGE_TTS_RATE || "+0%").trim();
  const volume = String(options.volume || process.env.EDGE_TTS_VOLUME || "+0%").trim();
  const outFile = `/tmp/edge-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  const wavFile = outFile.replace(/\.mp3$/u, ".wav");
  // Use --key=value so negative values like "-35%" are not parsed as extra flags.
  const args = [
    "-m",
    "edge_tts",
    "--voice",
    voice,
    `--rate=${rate}`,
    `--volume=${volume}`,
    "--text",
    String(text),
    "--write-media",
    outFile,
  ];
  const tts = spawn("python3", args, { stdio: ["ignore", "ignore", "ignore"] });
  tts.on("error", (err) => {
    console.warn("TTS (edge-tts) unavailable:", err.message);
  });
  tts.on("close", (code) => {
    if (code && code !== 0) {
      console.warn("TTS (edge-tts) exited with code", code);
      return;
    }
    const decode = spawn("mpg123", ["-q", "-w", wavFile, outFile], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    decode.on("error", (err) => {
      console.warn("TTS (mpg123) unavailable:", err.message);
    });
    decode.on("close", (decodeCode) => {
      if (decodeCode && decodeCode !== 0) {
        console.warn("TTS (mpg123 decode) exited with code", decodeCode);
        fs.unlink(outFile, () => {});
        return;
      }
      playFileWithMpg123Attempts(wavFile, (playErr) => {
        if (playErr) {
          console.warn("TTS (edge playback via mpg123) failed:", playErr.message);
        }
        fs.unlink(wavFile, () => {});
        fs.unlink(outFile, () => {});
      });
    });
    if (!loggedZhVoice) {
      console.log(`TTS Mandarin engine selected: edge (${voice})`);
      loggedZhVoice = true;
    }
  });
  return true;
}

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
  const language = String(options.language || "").trim().toLowerCase();
  const engine = String(process.env.TTS_ENGINE || "auto").trim().toLowerCase();
  if (language === "zh" && (engine === "auto" || engine === "edge")) {
    const spoke = speakWithEdge(text, options);
    if (spoke) return;
    if (engine === "edge") {
      console.warn("TTS_ENGINE=edge but edge-tts failed; falling back");
    }
  }
  if (language === "zh" && (engine === "auto" || engine === "piper")) {
    const spoke = speakWithPiper(text, options);
    if (spoke) return;
    if (engine === "piper") {
      console.warn("TTS_ENGINE=piper but piper failed; falling back to espeak-ng");
    }
  }
  if (
    language === "zh" &&
    engine === "auto" &&
    !loggedMandarinEspeakFallback
  ) {
    loggedMandarinEspeakFallback = true;
    console.warn(
      "TTS: Mandarin is using espeak-ng (robotic). Neural Edge TTS did not run or failed at startup; " +
        "Piper also did not play. Fix: ensure `python3 -c \"import edge_tts\"` works in the server container, " +
        "the Pi has internet (Edge API), and TTS_ENGINE is auto or edge. Check .env for TTS_ENGINE=espeak. " +
        "Optional: install Piper model under ./tts per docker-compose PIPER_MODEL_PATH.",
    );
  }
  const voice = options.voice
    ?? (language === "zh" ? pickBestMandarinVoice() : null)
    ?? process.env.TTS_VOICE
    ?? "en+f1";
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
  if (language === "zh" && !loggedZhVoice) {
    console.log(`TTS Mandarin voice selected: ${voice}`);
    loggedZhVoice = true;
  }
  espeak.stdin.write(text, "utf8");
  espeak.stdin.end();
}

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
 * @param {(err?: Error) => void} [onComplete] - Called when playback finishes or fails (err set on failure)
 */
export function playSystemAudio(filename, onComplete) {
  const filePath = path.join(audioAssetsDir(), filename);

  if (!fs.existsSync(filePath)) {
    const msg = `Audio file not found: ${filePath} (set AUDIO_ASSETS_DIR or add the file under server/audios)`;
    console.error(msg);
    if (typeof onComplete === "function") onComplete(new Error(msg));
    return;
  }

  playFileWithMpg123Attempts(filePath, (err) => {
    if (typeof onComplete === "function") onComplete(err);
  });
}
