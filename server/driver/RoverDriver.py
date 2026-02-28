import IIC
import sys
import json
import time
import select
from adafruit_servokit import ServoKit

class RoverDriver:
    def __init__(self):
        # --- Motor Parameters ---
        self.base_speed = 400 
        self.turn_factor = 0.4      
        self.tank_turn_factor = 0.6 
        IIC.set_motor_parameter()

        # --- Servo Parameters & Calibration ---
        try:
            self.kit = ServoKit(channels=16)
            self.pan_channel = 3
            self.tilt_channel = 7
            
            self.pan_center_point = 100.3
            self.tilt_center_point = 113.69
            
            self.pan_angle = 90.0
            self.tilt_angle = 90.0
            
            self.active_keys = []
            self.last_time = time.time()
            self.glide_speed = 45.0
            
            # --- THE MISSING ATTRIBUTE ---
            self.reset_timer = 0 

            # Boot Centering
            self.apply_servo_positions()
            time.sleep(0.8) 
            self.relax_servos()
            
        except Exception as e:
            sys.stderr.write(f"Servo hardware error: {e}\n")
            sys.stderr.flush()

    def apply_servo_positions(self):
        final_pan = self.pan_angle + (self.pan_center_point - 90.0)
        final_tilt = self.tilt_angle + (self.tilt_center_point - 90.0)
        final_pan = max(0, min(180, final_pan))
        final_tilt = max(0, min(180, final_tilt))
        self.kit.servo[self.pan_channel].angle = final_pan
        self.kit.servo[self.tilt_channel].angle = final_tilt

    def relax_servos(self):
        self.kit.servo[self.pan_channel].angle = None
        self.kit.servo[self.tilt_channel].angle = None

    def reset_servos(self):
        self.pan_angle = 90.0
        self.tilt_angle = 90.0
        self.apply_servo_positions()
        # Keep power on for 1.2s so it actually reaches 90/90
        self.reset_timer = time.time() + 1.2 
        print(json.dumps({"type": "servo_update", "pan": 90.0, "tilt": 90.0}), flush=True)

    def update_servos(self):
        now = time.time()
        dt = now - self.last_time
        self.last_time = now

        # 1. Check if we are moving via keys
        is_moving_keys = any(k.startswith('Arrow') for k in self.active_keys)

        if is_moving_keys:
            step = self.glide_speed * dt
            if 'ArrowLeft' in self.active_keys: self.pan_angle = min(180, self.pan_angle + step)
            if 'ArrowRight' in self.active_keys: self.pan_angle = max(0, self.pan_angle - step)
            if 'ArrowUp' in self.active_keys: self.tilt_angle = max(0, self.tilt_angle - step)
            if 'ArrowDown' in self.active_keys: self.tilt_angle = min(180, self.tilt_angle + step)
            
            self.apply_servo_positions()
            self.reset_timer = 0 # Cancel any active reset window if manual move starts
            print(json.dumps({
                "type": "servo_update", 
                "pan": round(self.pan_angle, 2), 
                "tilt": round(self.tilt_angle, 2)
            }), flush=True)

        else:
            # 2. Not moving via keys. Are we in the middle of a reset?
            if time.time() < self.reset_timer:
                self.apply_servo_positions()
            else:
                self.relax_servos()

    def handle_input(self, data):
        if isinstance(data, dict) and data.get("command") == "reset_servos":
            self.reset_servos()
        elif isinstance(data, list):
            self.active_keys = data
            # Apply motor logic for W, A, S, D
            v, h = 0, 0
            if 'w' in data: v += self.base_speed
            if 's' in data: v -= self.base_speed
            if 'a' in data: h -= (self.base_speed * self.turn_factor)
            if 'd' in data: h += (self.base_speed * self.turn_factor)
            if v == 0 and h != 0:
                h = (self.base_speed * self.tank_turn_factor) if h > 0 else -(self.base_speed * self.tank_turn_factor)
            IIC.control_speed(int(v + h), int(v + h), int(v - h), int(v - h)) if (v != 0 or h != 0) else IIC.control_pwm(0,0,0,0)

if __name__ == "__main__":
    print(json.dumps({"status": "ready"}), flush=True)
    rover = RoverDriver()
    while True:
        rlist, _, _ = select.select([sys.stdin], [], [], 0.02)
        if rlist:
            line = sys.stdin.readline()
            if line:
                try:
                    rover.handle_input(json.loads(line))
                except: pass
        rover.update_servos()