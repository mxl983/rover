const CONFIG = {
  X_TOLERANCE: 1.5,
  Y_TOLERANCE: 2.0,
  ROT_TOLERANCE: 3.0,

  MS_PER_CM: 80,
  MS_PER_DEG: 18,

  MAX_PULSE: 350,
  MIN_PULSE: 120,
  COOLDOWN: 2600,
};

export class AutoDocker {
  constructor(sendMoveCommand) {
    this.sendMoveCommand = sendMoveCommand;
    this.isBusy = false;
  }

  async processOffset(offset) {
    if (this.isBusy || !offset) return;
    this.isBusy = true;

    try {
      const { x, y, r } = offset;

      // Strict Tolerances
      const TOL_X = 2.0;
      const TOL_R = 3.0;
      const TOL_Y = 2.0;

      console.log(`[DOCK] X: ${x}, R: ${r}, Y: ${y}`);

      // --- PHASE 1: LATERAL CORRECTION (The "Staircase" Move) ---
      // If X is off, we do a "Turn-Drive-TurnBack" maneuver.
      if (Math.abs(x) > TOL_X) {
        console.log(`[STEP 1] Crab-walking to fix X: ${x}`);

        // A. Determine Direction
        // If x > 0 (Rover is Right), we need to go LEFT.
        // If x < 0 (Rover is Left), we need to go RIGHT.
        const moveLeft = x > 0;

        // B. Determine if we drive Forward or Backward to fix X
        // If we are far away (y > 20), drive Forward ('w').
        // If we are too close (y < 20), drive Backward ('s').
        const driveKey = y < 15 ? "s" : "w";

        // C. Calculate the "Pivot" keys
        // To move LEFT going FORWARD -> Turn Left ('a')
        // To move LEFT going BACKWARD -> Turn Right ('d') (Tail swing)
        let turnKey = [];
        if (driveKey === "w") {
          turnKey = moveLeft ? ["a"] : ["d"];
        } else {
          turnKey = moveLeft ? ["d"] : ["a"]; // Inverted for reverse
        }

        // --- EXECUTE THE MANEUVER ---

        // 1. Pivot (Turn 20 degrees toward the line)
        // Keep duration short so marker stays in FOV (approx 200ms)
        await this.executeStep(turnKey, 200);

        // 2. Drive (Move along the diagonal)
        // Small pulse to avoid overshooting (approx 300ms)
        await this.executeStep([driveKey], 300);

        // 3. Un-Pivot (Turn back to face the marker)
        // Use the opposite key of the first turn
        const unTurnKey = turnKey[0] === "a" ? ["d"] : ["a"];
        await this.executeStep(unTurnKey, 200);

        return; // Stop and let Vision update!
      }

      // --- PHASE 2: ROTATION FIX (Stationary) ---
      // Only happens if X is good.
      if (Math.abs(r) > TOL_R) {
        console.log(`[STEP 2] Squaring up rotation: ${r}`);
        const keys = r > 0 ? ["a"] : ["d"];
        await this.executeStep(keys, 150); // Short pulses for precision
        return;
      }

      // --- PHASE 3: DEPTH FIX (Straight) ---
      // Only happens if X and R are good.
      if (Math.abs(y) > TOL_Y) {
        console.log(`[STEP 3] Final approach/adjust: ${y}`);
        const keys = y > 0 ? ["w"] : ["s"];
        await this.executeStep(keys, 250); // Short pulses
        return;
      }

      console.log("🎯 DOCKING COMPLETE.");
    } finally {
      this.isBusy = false;
    }
  }

  async executeStep(keys, calculatedDuration) {
    const duration = Math.min(
      Math.max(calculatedDuration, CONFIG.MIN_PULSE),
      CONFIG.MAX_PULSE,
    );
    this.sendMoveCommand(keys);
    await new Promise((r) => setTimeout(r, duration));
    this.sendMoveCommand([]);
    await new Promise((r) => setTimeout(r, CONFIG.COOLDOWN));
  }
}
