import express from "express";
import { driverService } from "../services/driverService.js";
import { stateService } from "../services/stateService.js";

const router = express.Router();

router.post("/drive", (req, res) => {
  // Pass the entire body to the driver service
  driverService.sendMoveCommand(req.body);
  res.sendStatus(200);
});

router.post("/docking", (req, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Enabled must be true or false" });
  }

  stateService.isDockingMode = !!enabled;

  try {
    driverService.toggleDockingMode(enabled);
    res.json({
      status: "success",
      dockingMode: enabled ? "active" : "inactive",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle docking mode" });
  }
});

export default router;
