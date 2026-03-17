import express from "express";
import { exec } from "child_process";
import util from "util";
import axios from "axios";
import { success, error, badRequest, asyncHandler } from "../utils/apiResponse.js";
import { speak } from "../utils/sysUtils.js";
import { stateService } from "../services/stateService.js";

const router = express.Router();
const execPromise = util.promisify(exec);
const MEDIAMTX_API = "http://127.0.0.1:9997/v3/config/paths/patch/cam";

router.post(
  "/capture",
  asyncHandler(async (req, res) => {
    const fileName = `capture_${Date.now()}.jpg`;
    const filePath = `/app/photos/${fileName}`;
    try {
      await execPromise("DOCKER_API_VERSION=1.44 docker stop mediamtx");
      await execPromise(
        `rpicam-still -n -o "${filePath}" --width 4056 --height 3040 --immediate --flush`,
      );
      const photoUrl = `${req.protocol}://${req.get("host")}/photos/${fileName}`;
      success(res, { url: photoUrl, filename: fileName });
      if (!stateService.quietMode) speak("High resolution photo captured.");
    } finally {
      exec("DOCKER_API_VERSION=1.44 docker start mediamtx", (err) => {
        if (err) console.error("Failed to restart MediaMTX:", err);
      });
    }
  }),
);

router.post(
  "/nightvision",
  asyncHandler(async (req, res) => {
    const { active } = req.body ?? {};
    if (typeof active !== "boolean") {
      return badRequest(res, "active must be true or false");
    }
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

    await axios.patch(MEDIAMTX_API, config);
    success(res, { message: `Night Vision ${active ? "Enabled" : "Disabled"}` });
  }),
);

router.post(
  "/focus",
  asyncHandler(async (req, res) => {
    const { mode } = req.body ?? {};
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

    await axios.patch(MEDIAMTX_API, settings);
    success(res, { message: `Focus set to ${mode}` });
    if (!stateService.quietMode) speak(`Focus set to ${mode}.`);
  }),
);

router.post(
  "/resolution",
  asyncHandler(async (req, res) => {
    const { mode } = req.body ?? {};
    const resMap = {
    "240p": { width: 320, height: 240, fps: 60 },
    "480p": { width: 640, height: 480, fps: 60 },
    "720p": { width: 1280, height: 720, fps: 60 },
    "1080p": { width: 1920, height: 1080, fps: 30 },
    "2K": { width: 2304, height: 1296, fps: 15 },
  };

  const appliedMode = mode && resMap[mode] ? mode : "720p";
  const target = resMap[appliedMode];

  const settings = {
    rpiCameraWidth: target.width,
    rpiCameraHeight: target.height,
    rpiCameraFPS: target.fps,
  };

    await axios.patch(MEDIAMTX_API, settings);
    success(res, { message: `Resolution changed to ${appliedMode}` });
    if (!stateService.quietMode) speak(`Resolution set to ${appliedMode}.`);
  }),
);

router.post(
  "/settings",
  asyncHandler(async (req, res) => {
    const { settings } = req.body ?? {};
    if (!settings || typeof settings !== "object") {
      return badRequest(res, "settings object required");
    }
    await axios.patch(MEDIAMTX_API, settings);
    success(res, { message: "Settings applied" });
  }),
);

export default router;
