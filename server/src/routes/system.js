import express from "express";
import fs from "fs";
import { exec } from "child_process";
import util from "util";
import { stateService } from "../services/stateService.js";
import { success, error, badRequest, asyncHandler } from "../utils/apiResponse.js";

const router = express.Router();
const execPromise = util.promisify(exec);

router.post(
  "/shutdown",
  asyncHandler((req, res) => {
    fs.writeFileSync("/app/shared/shutdown.req", "shutdown requested at " + new Date().toISOString());
    success(res, { message: "Host shutdown signal sent to Pi." });
  }),
);

router.post(
  "/reboot",
  asyncHandler((req, res) => {
    fs.writeFileSync("/app/shared/reboot.req", "rebooting");
    success(res, { message: "Host reboot sequence initiated." });
  }),
);

router.post(
  "/usb-power",
  asyncHandler(async (req, res) => {
    const { action } = req.body ?? {};
    if (action !== "on" && action !== "off") {
      return badRequest(res, "action must be 'on' or 'off'");
    }
    const state = action === "on" ? "1" : "0";
    await execPromise(`sudo uhubctl -l 1-1 -a ${state}`);
    stateService.usbPowerState = action === "on";
    success(res, {
      usbPower: action,
      warning: action === "off" ? "USB Audio disconnected" : "USB Audio re-enabled",
    });
  }),
);

export default router;
