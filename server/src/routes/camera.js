import express from "express";
import { exec } from "child_process";
import util from "util";
import axios from "axios";
import path from "path";

const router = express.Router();
const execPromise = util.promisify(exec);
const MEDIAMTX_API = "http://127.0.0.1:9997/v3/config/paths/patch/cam";

router.post("/capture", async (req, res) => {
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

router.post("/nightvision", async (req, res) => {
  const { active } = req.body;

  const config = active
    ? {
        rpiCameraFPS: 30,
        rpiCameraShutter: 66000,
        rpiCameraGain: 16.0,
        rpiCameraExposure: "long",

        rpiCameraBrightness: 0.15,
        rpiCameraContrast: 1.2,
        rpiCameraSaturation: 0.5,
      }
    : {
        rpiCameraFPS: 60,
        rpiCameraShutter: 0,
        rpiCameraGain: 0,
        rpiCameraExposure: "normal",
        rpiCameraBrightness: 0,
        rpiCameraContrast: 1.0,
        rpiCameraSaturation: 1.0,
      };

  try {
    await axios.patch(MEDIAMTX_API, config);

    res.json({ message: `Night Vision ${active ? "Enabled" : "Disabled"}` });
  } catch (err) {
    console.error("MediaMTX API Error:", err.message);
    res.status(500).json({ error: "Failed to update camera settings" });
  }
});

router.post("/focus", async (req, res) => {
  const { mode } = req.body;

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
    await axios.patch(MEDIAMTX_API, settings);
    res.json({ message: `Focus set to ${mode}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to apply focus" });
  }
});

router.post("/resolution", async (req, res) => {
  const { mode } = req.body;

  const resMap = {
    "240p": { width: 320, height: 240, fps: 60 },
    "480p": { width: 640, height: 480, fps: 60 },
    "720p": { width: 1280, height: 720, fps: 60 },
    "1080p": { width: 1920, height: 1080, fps: 30 },
    "2K": { width: 2304, height: 1296, fps: 15 },
  };

  const target = resMap[mode] || resMap["720p"];

  const settings = {
    rpiCameraWidth: target.width,
    rpiCameraHeight: target.height,
    rpiCameraFPS: target.fps,
  };

  try {
    await axios.patch(MEDIAMTX_API, settings);
    res.json({ message: `Resolution changed to ${mode}` });
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

router.post("/settings", async (req, res) => {
  const { settings } = req.body;

  try {
    await axios.patch(MEDIAMTX_API, settings);
    res.json({ message: "Settings applied" });
  } catch (err) {
    res.status(500).send("API Error");
  }
});

export default router;
