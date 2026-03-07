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
            self.glide_speed = 45.0 # Degrees per second
            
            # --- Timing & Reporting ---
            self.reset_timer = 0 
            self.last_report_time = 0
            self.report_interval = 0.1 # 10Hz reporting back to dashboard

            # Boot Centering
            self.apply_servo_positions()
            time.sleep(0.8) 
            self.relax_servos()
            
        except Exception as e:
            sys.stderr.write(f"Servo hardware error: {e}\n")
            sys.stderr.flush()

    def apply_servo_positions(self):
        """Applies the calculated angles to the physical hardware."""
        final_pan = self.pan_angle + (self.pan_center_point - 90.0)
        final_tilt = self.tilt_angle + (self.tilt_center_point - 90.0)
        
        # Hardware Safety Bounds
        final_pan = max(0, min(180, final_pan))
        final_tilt = max(0, min(180, final_tilt))
        
        self.kit.servo[self.pan_channel].angle = final_pan
        self.kit.servo[self.tilt_channel].angle = final_tilt

    def relax_servos(self):
        """Cuts PWM signal to prevent jitter and save power."""
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

    def update_servos(self):
        """Main loop logic for movement and power management."""
        now = time.time()
        dt = now - self.last_time
        self.last_time = now

        # 1. Check for Arrow Key Movement
        is_moving_keys = any(k.startswith('Arrow') for k in self.active_keys)

        if is_moving_keys:
            step = self.glide_speed * dt
            if 'ArrowLeft' in self.active_keys: self.pan_angle = min(180, self.pan_angle + step)
            if 'ArrowRight' in self.active_keys: self.pan_angle = max(0, self.pan_angle - step)
            if 'ArrowUp' in self.active_keys: self.tilt_angle = max(0, self.tilt_angle - step)
            if 'ArrowDown' in self.active_keys: self.tilt_angle = min(180, self.tilt_angle + step)
            
            self.apply_servo_positions()
            # Set a short 500ms window to hold position after key release
            self.reset_timer = time.time() + 0.5 
            
            # Send real-time updates while moving
            self.report_angle()

        else:
            # 2. Not moving. Are we within a power window (resetting or just stopped)?
            if time.time() < self.reset_timer:
                self.apply_servo_positions()
            else:
                self.relax_servos()

    def handle_input(self, data):
        """Processes incoming commands from Node.js stdin."""
        if isinstance(data, dict) and data.get("command") == "reset_servos":
            self.reset_servos()
        elif isinstance(data, list):
            self.active_keys = data
            
            # --- Motor Logic (W, A, S, D) ---
            v, h = 0, 0
            if 'w' in data: v += self.base_speed
            if 's' in data: v -= self.base_speed
            if 'a' in data: h -= (self.base_speed * self.turn_factor)
            if 'd' in data: h += (self.base_speed * self.turn_factor)
            
            # Tank Turn Logic
            if v == 0 and h != 0:
                h = (self.base_speed * self.tank_turn_factor) if h > 0 else -(self.base_speed * self.tank_turn_factor)
            
            if (v != 0 or h != 0):
                IIC.control_speed(int(v + h), int(v + h), int(v - h), int(v - h))
            else:
                IIC.control_pwm(0,0,0,0)

if __name__ == "__main__":
    # Signal to Node.js that the child process is alive
    print(json.dumps({"status": "ready"}), flush=True)
    rover = RoverDriver()
    
    while True:
        # Check for input without blocking the loop (0.02s timeout)
        rlist, _, _ = select.select([sys.stdin], [], [], 0.02)
        if rlist:
            line = sys.stdin.readline()
            if line:
                try:
                    rover.handle_input(json.loads(line))
                except:
                    pass
        
        # Always run servo update (allows for glide and power-off timing)
        rover.update_servos()