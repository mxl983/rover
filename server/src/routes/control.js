import express from "express";
import { driverService } from "../services/driverService.js";
import { stateService } from "../services/stateService.js";
import { success, badRequest, asyncHandler } from "../utils/apiResponse.js";

const router = express.Router();

export function isValidDrivePayload(body) {
  if (Array.isArray(body)) return true;
  if (body && typeof body === "object") {
    if (
      body.command === "look_down" ||
      body.command === "turn_left_90_slow" ||
      body.command === "turn_right_90_slow"
    )
      return true;
    if ("drive" in body && body.drive != null && typeof body.drive !== "object") return false;
    if ("gimbal" in body && body.gimbal != null && typeof body.gimbal !== "object") return false;
    return true;
  }
  return false;
}

router.post(
  "/drive",
  asyncHandler((req, res) => {
    if (!isValidDrivePayload(req.body)) {
      return badRequest(res, "Body must be an array of keys or { drive?, gimbal? }");
    }
    const quiet = stateService.quietMode;
    const cmd = Array.isArray(req.body) ? { keys: req.body, quietMode: quiet } : { ...req.body, quietMode: quiet };
    driverService.sendMoveCommand(cmd);
    success(res, { accepted: true });
  }),
);

router.post("/docking", (req, res) => {
  stateService.isDockingMode = false;
  success(res, { dockingMode: "inactive" });
});

export default router;
