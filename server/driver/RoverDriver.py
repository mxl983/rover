import os
import sys
import json
import time
import select
import math

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
        self.glide_speed = 50.0  # deg/s for keyboard (slightly snappier)
        self.analog_gimbal_scale = 70.0  # deg/s for full stick (crisp response)
        self.reset_timer = 0
        self.last_report_time = 0
        self.report_interval = 0.05  # 20 Hz to dashboard for responsive UI
        self.drive_deadzone = 0.04
        self.gimbal_deadzone = 0.03

        try:
            self.kit = ServoKit(channels=16)
            self.pan_channel = 3
            self.tilt_channel = 7
            self.pan_center_point = 100.3
            self.tilt_center_point = 113.69
            # Boot centering
            self.apply_servo_positions()
            time.sleep(0.8)
            self.relax_servos()
        except Exception as e:
            sys.stderr.write(f"Servo hardware error: {e}\n")
            sys.stderr.flush()
            self.kit = None

    def apply_servo_positions(self):
        """Applies the calculated angles to the physical hardware."""
        if self.kit is None:
            return
        final_pan = self.pan_angle + (self.pan_center_point - 90.0)
        final_tilt = self.tilt_angle + (self.tilt_center_point - 90.0)
        final_pan = max(0, min(180, final_pan))
        final_tilt = max(0, min(180, final_tilt))
        self.kit.servo[self.pan_channel].angle = final_pan
        self.kit.servo[self.tilt_channel].angle = final_tilt

    def relax_servos(self):
        """Cuts PWM signal to prevent jitter and save power."""
        if self.kit is None:
            return
        self.kit.servo[self.pan_channel].angle = None
        self.kit.servo[self.tilt_channel].angle = None

    def reset_servos(self):
        """Smoothly returns camera to 90/90 center."""
        self.pan_angle = 90.0
        self.tilt_angle = 90.0
        self.apply_servo_positions()
        # Keep power on for 1.2s to ensure it reaches center
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

    def update_drive(self):
        """Apply drive commands: analog (400–500) or keyboard WASD. Forward/back corrected for rover wiring."""
        if self.analog_drive is not None:
            x = float(self.analog_drive.get("x", 0) or 0)
            y = float(self.analog_drive.get("y", 0) or 0)
            mag = math.sqrt(x * x + y * y)
            if mag < self.drive_deadzone:
                IIC.control_pwm(0, 0, 0, 0)
                return
            mag = min(1.0, mag)
            curve = math.pow(mag, self.speed_curve)  # gentler at low stick
            speed = self.min_speed + (self.max_speed - self.min_speed) * curve
            v = -y * speed   # forward/back reversed to match rover
            h = x * speed
            if abs(v) < 1 and abs(h) < 1:
                IIC.control_pwm(0, 0, 0, 0)
                return
            IIC.control_speed(int(v + h), int(v + h), int(v - h), int(v - h))
            return

        data = self.active_keys
        v, h = 0, 0
        if "w" in data:
            v += self.base_speed
        if "s" in data:
            v -= self.base_speed
        if "a" in data:
            h -= self.base_speed * self.turn_factor
        if "d" in data:
            h += self.base_speed * self.turn_factor
        if v == 0 and h != 0:
            h = (self.base_speed * self.tank_turn_factor) if h > 0 else -(self.base_speed * self.tank_turn_factor)
        if v != 0 or h != 0:
            IIC.control_speed(int(v + h), int(v + h), int(v - h), int(v - h))
        else:
            IIC.control_pwm(0, 0, 0, 0)

    def update_servos(self):
        """Main loop logic for movement and power management."""
        now = time.time()
        dt = now - self.last_time
        self.last_time = now

        # Gimbal: analog (all directions reversed to match hardware) or arrow keys
        if self.analog_gimbal is not None:
            gx = float(self.analog_gimbal.get("x", 0) or 0)
            gy = float(self.analog_gimbal.get("y", 0) or 0)
            if abs(gx) > self.gimbal_deadzone or abs(gy) > self.gimbal_deadzone:
                rate = self.analog_gimbal_scale * dt
                self.pan_angle = max(0, min(180, self.pan_angle - gx * rate))   # reversed
                self.tilt_angle = max(0, min(180, self.tilt_angle + gy * rate))  # reversed
                self.apply_servo_positions()
                self.reset_timer = time.time() + 0.4
                self.report_angle()
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
        if isinstance(data, dict):
            if "drive" in data:
                self.analog_drive = data["drive"]
            if "gimbal" in data:
                self.analog_gimbal = data["gimbal"]
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
        # Tight loop (~67 Hz) for responsive drive/gimbal
        rlist, _, _ = select.select([sys.stdin], [], [], 0.015)
        if rlist:
            line = sys.stdin.readline()
            if line:
                try:
                    rover.handle_input(json.loads(line))
                except:
                    pass
        
        rover.update_drive()
        rover.update_servos()