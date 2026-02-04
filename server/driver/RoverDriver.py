import IIC
import sys
import json

class RoverDriver:
    def __init__(self):
        self.base_speed = 500
        self.turn_factor = 0.6
        # IIC.set_motor_parameter()

    def update_movement(self, keys):
        v, h = 0, 0
        if 'w' in keys: v += self.base_speed
        if 's' in keys: v -= self.base_speed
        if 'a' in keys: h -= (self.base_speed * self.turn_factor)
        if 'd' in keys: h += (self.base_speed * self.turn_factor)

        if v == 0 and h != 0:
            h = self.base_speed if h > 0 else -self.base_speed

        left_speed = int(v + h)
        right_speed = int(v - h)

        # Send command to hardware
        # IIC.control_speed(left_speed, right_speed, left_speed, right_speed)
        
        # RETURN DATA: This is what Node.js will receive
        print(json.dumps({
            "status": "ok",
            "motors": {"L": left_speed, "R": right_speed},
            "keys": keys
        }))
        sys.stdout.flush() # CRITICAL: Sends the data to Node immediately

# --- THE SCRIPT PART ---
if __name__ == "__main__":
    rover = RoverDriver()
    
    # This loop keeps Python alive and listening for Node.js
    for line in sys.stdin:
        try:
            active_keys = json.loads(line)
            rover.update_movement(active_keys)
        except Exception as e:
            # If something breaks, tell Node.js instead of crashing silently
            print(json.dumps({"status": "error", "message": str(e)}))
            sys.stdout.flush()