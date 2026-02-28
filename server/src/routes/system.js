import express from "express";
import fs from "fs";
import { exec } from "child_process";
import util from "util";
import { stateService } from "../services/stateService.js";

const router = express.Router();
const execPromise = util.promisify(exec);

router.post("/shutdown", (req, res) => {
  // Create the "trigger" file in the shared volume
  const triggerPath = "/app/shared/shutdown.req";
  fs.writeFileSync(
    triggerPath,
    "shutdown requested at " + new Date().toISOString(),
  );

  res.json({ message: "Host shutdown signal sent to Pi." });
});

router.post("/reboot", (req, res) => {
  try {
    // Create the "reboot" trigger file in the shared volume
    fs.writeFileSync("/app/shared/reboot.req", "rebooting");
    res.json({ message: "Host reboot sequence initiated." });
  } catch (err) {
    res.status(500).json({ error: "Failed to write signal file" });
  }
});

router.post("/usb-power", async (req, res) => {
  const { action } = req.body; // Expecting "on" or "off"

  // Mapping action to uhubctl state (1 = on, 0 = off)
  const state = action === "on" ? "1" : "0";

  try {
    // Targeting hub 1-1 which we verified controls your lights/audio
    console.log(`Setting USB Power to: ${action}`);
    await execPromise(`sudo uhubctl -l 1-1 -a ${state}`);

    stateService.usbPowerState = action === "on";

    res.json({
      status: "success",
      usbPower: action,
      warning:
        action === "off" ? "USB Audio disconnected" : "USB Audio re-enabled",
    });
  } catch (error) {
    console.error("USB Power Error:", error);
    res
      .status(500)
      .json({ error: "Failed to toggle USB power. Is uhubctl installed?" });
  }
});

export default router;
