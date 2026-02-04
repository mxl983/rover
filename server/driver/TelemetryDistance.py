import IIC
import sys
import json
import math

class DistanceTracker:
    def __init__(self):
        # 520 motor constants from IIC.py
        self.ppr = 11 * 30 
        self.diameter = 67.0
        self.circumference = self.diameter * math.pi

    def get_distances(self):
        # Use the encoder reading logic from IIC.py
        IIC.read_all_encoder()
        raw_ticks = IIC.encoder_now # This is updated by read_all_encoder()
        
        distances_mm = {}
        for i, ticks in enumerate(raw_ticks):
            # Calculate distance in mm for each of the 4 motors
            mm = (ticks / self.ppr) * self.circumference
            distances_mm[f"M{i+1}"] = round(mm, 2)
            
        return distances_mm

if __name__ == "__main__":
    tracker = DistanceTracker()
    
    for line in sys.stdin:
        try:
            cmd = json.loads(line)
            if cmd.get("command") == "get_distance":
                data = tracker.get_distances()
                print(json.dumps({
                    "status": "ok",
                    "type": "distance",
                    "values": data,
                    "unit": "mm"
                }))
                sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))
            sys.stdout.flush()