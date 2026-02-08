import IIC
import sys
import json

class RoverDriver:
    def __init__(self):
        self.base_speed = 500
        self.turn_factor = 0.3
        IIC.set_motor_parameter()

    def update_movement(self, keys):
        v, h = 0, 0
        
        # If keys list is empty, v and h remain 0 (Stopping)
        if 'w' in keys: v += self.base_speed
        if 's' in keys: v -= self.base_speed
        if 'a' in keys: h -= (self.base_speed * self.turn_factor)
        if 'd' in keys: h += (self.base_speed * self.turn_factor)

        # Tank turn logic (Spin in place)
        if v == 0 and h != 0:
            h = self.base_speed if h > 0 else -self.base_speed

        left_speed = int(v + h)
        right_speed = int(v - h)

        # --- FIX: Correct Motor Indexing ---
        # Assuming typical layout: (FL, FR, RL, RR)
        # We send left_speed to 1st and 3rd, right_speed to 2nd and 4th
        IIC.control_speed(left_speed, left_speed, right_speed, right_speed)
        
        # If speed is 0, some drivers need a moment to settle the PWM
        if left_speed == 0 and right_speed == 0:
            # PWM Mode bypasses the deceleration curve
            IIC.control_pwm(0, 0, 0, 0)
        

        print(json.dumps({
            "status": "ok",
            "motors": {"L": left_speed, "R": right_speed},
            "keys": keys,
            "voltage": IIC.get_battery_voltage()
        }), flush=True)

if __name__ == "__main__":
    rover = RoverDriver()
    for line in sys.stdin:
        try:
            active_keys = json.loads(line)
            rover.update_movement(active_keys)
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}), flush=True)