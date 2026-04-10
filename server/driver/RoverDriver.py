import os
import sys
import json
import time
import select
import math

def _debug(msg, throttle_interval=0.5, key=None):
    """Write to stderr for debugging; throttle by key to avoid flood."""
    now = time.time()
    if not hasattr(_debug, "_last"):
        _debug._last = {}
    k = key if key is not None else "default"
    if k not in _debug._last or (now - _debug._last[k]) >= throttle_interval:
        _debug._last[k] = now
        sys.stderr.write(f"[gimbal] {msg}\n")
        sys.stderr.flush()

# Force Blinka to use Raspberry Pi 3 when in Docker (so board_imports.json path works)
if "BLINKA_FORCEBOARD" not in os.environ and sys.platform == "linux":
    os.environ["BLINKA_FORCEBOARD"] = "RASPBERRY_PI_3B"
if "BLINKA_FORCECHIP" not in os.environ and sys.platform == "linux":
    os.environ["BLINKA_FORCECHIP"] = "BCM2XXX"

import IIC
from adafruit_servokit import ServoKit


class RoverDriver:
    def __init__(self):
        # --- Motor Parameters (keyboard: 400; joystick: 400–450, softer curve for easier control) ---
        self.base_speed = 400
        self.min_speed = 400
        self.max_speed = 450
        self.speed_curve = 0.8  # exponent < 1 = gentler at low stick (easier to control)
        self.turn_factor = 0.4
        self.tank_turn_factor = 0.6
        IIC.set_motor_parameter()

        # --- Servo Parameters & Calibration ---
        self.pan_angle = 90.0
        self.tilt_angle = 90.0
        self.active_keys = []
        self.analog_drive = None
        self.analog_gimbal = None
        self.last_time = time.time()
        self.glide_speed = 100.0  # deg/s for keyboard (snappy)
        self.analog_gimbal_scale = 115.0  # deg/s (responsive joystick, low latency)
        self.reset_timer = 0
        self.last_report_time = 0
        self.report_interval = 0.025  # ~40 Hz to dashboard
        self.drive_deadzone = 0.025
        self.gimbal_deadzone = 0.012

        self._servo_warned = False
        self._last_throttle = -1
        self.quick_turn_until = 0.0
        self.quiet_mode = True  # When True, slow steady drive; False = boost (full speed)
        self.quick_turn_dir = 0  # -1 = left, +1 = right
        try:
            self.kit = ServoKit(channels=16)
            self.pan_channel = 3
            self.tilt_channel = 7
            # Pan calibration: small tweak (~2.95°) from original
            # so previous 87.05° reading now shows closer to 90° logical.
            self.pan_center_point = 97.35
            self.tilt_center_point = 113.69
            # Boot centering
            self.apply_servo_positions()
            time.sleep(0.8)
            self.relax_servos()
        except Exception as e:
            sys.stderr.write(f"[gimbal] Servo hardware error: {e}\n")
            sys.stderr.flush()
            self.kit = None
        if self.kit is not None:
            sys.stderr.write("[gimbal] Servo kit OK (I2C PCA9685); pan=ch3, tilt=ch7\n")
            sys.stderr.flush()

        # KY-008 laser on GPIO17; init lazily on first toggle to avoid touching GPIO at startup
        self.laser_on = False
        self._laser_pin = None

    def _ensure_laser_pin(self):
        """Lazy-init GPIO17 for laser; no-op if not on Pi or GPIO unavailable."""
        if self._laser_pin is not None:
            return True
        try:
            import board
            import digitalio
            self._laser_pin = digitalio.DigitalInOut(board.D17)
            self._laser_pin.direction = digitalio.Direction.OUTPUT
            self._laser_pin.value = False
            sys.stderr.write("[gimbal] Laser GPIO17 (KY-008) initialized\n")
            sys.stderr.flush()
            return True
        except Exception as e:
            sys.stderr.write("[gimbal] Laser GPIO17 init failed: %s\n" % e)
            sys.stderr.flush()
            return False

    def set_laser(self, on):
        """Set laser on/off and report state to dashboard."""
        self.laser_on = bool(on)
        if self._ensure_laser_pin():
            self._laser_pin.value = self.laser_on
        print(json.dumps({"type": "laser_update", "on": self.laser_on}), flush=True)

    def toggle_laser(self):
        """Toggle laser on/off."""
        self.set_laser(not self.laser_on)

    def apply_servo_positions(self):
        """Applies the calculated angles to the physical hardware."""
        if self.kit is None:
            if not self._servo_warned:
                self._servo_warned = True
                sys.stderr.write("[gimbal] Servos disabled: no I2C kit (e.g. Docker without /dev/i2c-1). Angles would be pan=%.1f tilt=%.1f\n" % (self.pan_angle, self.tilt_angle))
                sys.stderr.flush()
            return
        final_pan = self.pan_angle + (self.pan_center_point - 90.0)
        final_tilt = self.tilt_angle + (self.tilt_center_point - 90.0)
        final_pan = max(0, min(180, final_pan))
        final_tilt = max(0, min(180, final_tilt))
        self.kit.servo[self.pan_channel].angle = final_pan
        self.kit.servo[self.tilt_channel].angle = final_tilt
        _debug("apply_servo pan=%.1f tilt=%.1f (raw %.1f %.1f)" % (final_pan, final_tilt, self.pan_angle, self.tilt_angle), throttle_interval=0.25, key="apply")

    def relax_servos(self):
        """Cuts PWM signal to prevent jitter and save power."""
        if self.kit is None:
            return
        self.kit.servo[self.pan_channel].angle = None
        self.kit.servo[self.tilt_channel].angle = None

    def reset_servos(self):
        """Smoothly returns camera to 90/90 center."""
        # Drop stale joystick/voice gimbal so reset is not immediately undone.
        self.analog_gimbal = None
        self.pan_angle = 90.0
        self.tilt_angle = 90.0
        self.apply_servo_positions()
        # Keep power on for 1.2s to ensure it reaches center
        self.reset_timer = time.time() + 1.2 
        self.report_angle(force=True)

    def look_down(self):
        """Center pan and tilt down to see floor/wheels in tight spaces."""
        self.analog_gimbal = None
        self.pan_angle = 90.0
        # Parking view: tilt about +60° down from neutral (60° + 90° = 150°)
        self.tilt_angle = 150.0
        self.apply_servo_positions()
        self.reset_timer = time.time() + 1.2
        self.report_angle(force=True)

    def report_angle(self, force=False):
        """Sends current angles to stdout for Node.js/Dashboard."""
        now = time.time()
        if force or (now - self.last_report_time > self.report_interval):
            print(json.dumps({
                "type": "servo_update", 
                "pan": round(self.pan_angle, 2), 
                "tilt": round(self.tilt_angle, 2)
            }), flush=True)
            self.last_report_time = now

    def _report_throttle(self, throttle_pct):
        """Report commanded motor throttle 0-100 for dashboard (immediate rev indicator)."""
        throttle_pct = round(throttle_pct, 1)
        if throttle_pct == self._last_throttle:
            return
        self._last_throttle = throttle_pct
        print(json.dumps({"type": "throttle_update", "throttle": throttle_pct}), flush=True)

    def update_drive(self):
        """Apply drive commands: analog (400–500) or keyboard WASD. Forward/back corrected for rover wiring."""
        now = time.time()
        # Quiet mode: much slower speeds to reduce noise
        speed_scale = 0.28 if self.quiet_mode else 1.0
        base = int(self.base_speed * speed_scale)
        min_s = int(self.min_speed * speed_scale)
        max_s = int(self.max_speed * speed_scale)

        # Quick 90° turns (triggered via commands, slow to avoid body shake)
        if self.quick_turn_until > now and self.quick_turn_dir != 0:
            turn_speed = base * 0.35
            h = turn_speed if self.quick_turn_dir > 0 else -turn_speed
            fl, fr = h, -h
            IIC.control_speed(int(fl), int(fl), int(fr), int(fr))
            avg = (abs(fl) + abs(fr)) / 2.0
            self._report_throttle(min(100, (avg / 500.0) * 100))
            return
        elif self.quick_turn_until > 0 and self.quick_turn_until <= now:
            # End of quick turn window
            self.quick_turn_until = 0.0
            self.quick_turn_dir = 0

        if self.analog_drive is not None:
            x = float(self.analog_drive.get("x", 0) or 0)
            y = float(self.analog_drive.get("y", 0) or 0)
            mag = math.sqrt(x * x + y * y)
            if mag < self.drive_deadzone:
                IIC.control_pwm(0, 0, 0, 0)
                self._report_throttle(0)
                return
            mag = min(1.0, mag)
            curve = math.pow(mag, self.speed_curve)  # gentler at low stick
            speed = min_s + (max_s - min_s) * curve
            v = -y * speed   # forward/back reversed to match rover
            h = x * speed
            if abs(v) < 1 and abs(h) < 1:
                IIC.control_pwm(0, 0, 0, 0)
                self._report_throttle(0)
                return
            fl = v + h
            fr = v - h
            IIC.control_speed(int(fl), int(fl), int(fr), int(fr))
            avg = (abs(fl) + abs(fr)) / 2.0
            self._report_throttle(min(100, (avg / 500.0) * 100))
            return

        data = self.active_keys
        v, h = 0, 0
        if "w" in data:
            v += base
        if "s" in data:
            v -= base
        if "a" in data:
            h -= base * self.turn_factor
        if "d" in data:
            h += base * self.turn_factor
        if v == 0 and h != 0:
            h = (base * self.tank_turn_factor) if h > 0 else -(base * self.tank_turn_factor)
        if v != 0 or h != 0:
            fl, fr = v + h, v - h
            IIC.control_speed(int(fl), int(fl), int(fr), int(fr))
            avg = (abs(fl) + abs(fr)) / 2.0
            self._report_throttle(min(100, (avg / 500.0) * 100))
        else:
            IIC.control_pwm(0, 0, 0, 0)
            self._report_throttle(0)

    def update_servos(self):
        """Main loop logic for movement and power management."""
        now = time.time()
        dt = now - self.last_time
        self.last_time = now

        # Gimbal: analog (all directions reversed to match hardware) or arrow keys
        if self.analog_gimbal is not None:
            try:
                gx = float(self.analog_gimbal.get("x", 0) or 0)
                gy = float(self.analog_gimbal.get("y", 0) or 0)
            except (TypeError, ValueError):
                gx, gy = 0.0, 0.0
            in_deadzone = not (abs(gx) > self.gimbal_deadzone or abs(gy) > self.gimbal_deadzone)
            if not in_deadzone:
                rate = self.analog_gimbal_scale * dt
                self.pan_angle = max(0, min(180, self.pan_angle - gx * rate))   # reversed
                self.tilt_angle = max(0, min(180, self.tilt_angle + gy * rate))  # reversed
                self.apply_servo_positions()
                self.reset_timer = time.time() + 0.4
                self.report_angle()
                _debug("gimbal stick gx=%.3f gy=%.3f -> pan=%.1f tilt=%.1f kit=%s" % (gx, gy, self.pan_angle, self.tilt_angle, "OK" if self.kit else "None"), throttle_interval=0.3, key="stick")
            else:
                if time.time() < self.reset_timer:
                    self.apply_servo_positions()
                else:
                    self.relax_servos()
            return

        is_moving_keys = any(k.startswith("Arrow") for k in self.active_keys)
        if is_moving_keys:
            step = self.glide_speed * dt
            if "ArrowLeft" in self.active_keys:
                self.pan_angle = min(180, self.pan_angle + step)
            if "ArrowRight" in self.active_keys:
                self.pan_angle = max(0, self.pan_angle - step)
            if "ArrowUp" in self.active_keys:
                self.tilt_angle = max(0, self.tilt_angle - step)
            if "ArrowDown" in self.active_keys:
                self.tilt_angle = min(180, self.tilt_angle + step)
            self.apply_servo_positions()
            self.reset_timer = time.time() + 0.4
            self.report_angle()
        else:
            if time.time() < self.reset_timer:
                self.apply_servo_positions()
            else:
                self.relax_servos()

    def handle_input(self, data):
        """Processes incoming commands from Node.js stdin. List = keyboard (WASD + arrows), dict = joystick analog or command."""
        if isinstance(data, dict) and data.get("command") == "reset_servos":
            self.reset_servos()
            return
        if isinstance(data, dict) and data.get("command") == "look_down":
            self.look_down()
            return
        if isinstance(data, dict) and data.get("command") == "turn_left_90_slow":
            # Slow ~90° left turn; duration tuned so 2.43s ≈ 90° (was 2.7s → ~100°).
            self.quick_turn_dir = -1
            self.quick_turn_until = time.time() + 2.43
            self.analog_drive = None
            self.active_keys = []
            return
        if isinstance(data, dict) and data.get("command") == "turn_right_90_slow":
            # Slow ~90° right turn; same duration as left (2.43s ≈ 90°).
            self.quick_turn_dir = 1
            self.quick_turn_until = time.time() + 2.43
            self.analog_drive = None
            self.active_keys = []
            return
        if isinstance(data, dict) and data.get("command") == "toggle_laser":
            self.toggle_laser()
            return
        if isinstance(data, dict):
            if "quietMode" in data:
                self.quiet_mode = bool(data["quietMode"])
            if "keys" in data and isinstance(data.get("keys"), list):
                self.analog_drive = None
                self.analog_gimbal = None
                self.active_keys = data["keys"]
            elif "drive" in data:
                self.analog_drive = data["drive"]
            if "gimbal" in data:
                g = data["gimbal"]
                # Keep gimbal mode active; normalize to dict with numeric x,y
                if g is not None and isinstance(g, dict):
                    self.analog_gimbal = {
                        "x": float(g.get("x", 0) or 0),
                        "y": float(g.get("y", 0) or 0),
                    }
                else:
                    self.analog_gimbal = {"x": 0.0, "y": 0.0}
                # Debug: log incoming gimbal (throttled)
                gx, gy = self.analog_gimbal["x"], self.analog_gimbal["y"]
                if abs(gx) > 0.02 or abs(gy) > 0.02:
                    _debug("rx gimbal x=%.3f y=%.3f (raw type=%s)" % (gx, gy, type(g).__name__), throttle_interval=0.5, key="rx")
            return
        if isinstance(data, list):
            self.analog_drive = None
            self.analog_gimbal = None
            self.active_keys = data

if __name__ == "__main__":
    # Signal to Node.js that the child process is alive
    print(json.dumps({"status": "ready"}), flush=True)
    rover = RoverDriver()

    while True:
        # Tight loop (~1000 Hz) for minimal gimbal latency
        rlist, _, _ = select.select([sys.stdin], [], [], 0.001)
        if rlist:
            # Drain stdin and apply only the latest command (avoids lag behind mouse burst)
            last_data = None
            while True:
                line = sys.stdin.readline()
                if not line:
                    break
                try:
                    last_data = json.loads(line)
                except Exception:
                    pass
                # Non-blocking check: more data available?
                rlist, _, _ = select.select([sys.stdin], [], [], 0)
                if not rlist:
                    break
            if last_data is not None:
                rover.handle_input(last_data)
        rover.update_drive()
        rover.update_servos()