import IIC
import sys
import json
import time
import math
import smbus

bus = smbus.SMBus(1)
VOLTAGE_REG = 0x08
address = 0x26 # 0x26 as confirmed by your i2cdump

class VoltageMonitor:
    def __init__(self):
        # We call this to ensure the board is awake and ADCs are active
        self.ppr = 11 * 30 * 10
        self.diameter = 67.0
        self.circumference = self.diameter * math.pi
        self.last_ticks = 0
        self.total_mileage_mm = 0
        try:
            IIC.set_motor_parameter()
        except:
            pass

    def get_voltage(self):
        try:
            voltage_raw = IIC.get_battery_voltage()
            return voltage_raw
                
        except Exception as e:
            # Log error to stderr so it doesn't break the JSON stdout pipe
            sys.stderr.write(f"Voltage Read Error: {e}\n")
            return None
        
    def get_distances(self):
        IIC.read_all_encoder()
        # Using M1 as your reference
        current_ticks = IIC.encoder_now[0] 
        
        # 1. Calculate how many ticks happened since the LAST check
        delta_ticks = current_ticks - self.last_ticks
        
        # 2. Convert the ABSOLUTE delta to mm and add to total
        # (This ensures reversing ADDS to mileage instead of subtracting)
        step_dist = abs((delta_ticks / self.ppr) * self.circumference)
        self.total_mileage_mm += step_dist
        
        # 3. Update last_ticks for the next loop
        self.last_ticks = current_ticks
        
        return round(self.total_mileage_mm, 2)


if __name__ == "__main__":
    monitor = VoltageMonitor()
    
    # Standard input loop for Node.js communication
    for line in sys.stdin:
        try:
            cmd = json.loads(line.strip())
            
            if cmd.get("command") == "get_voltage":
                voltage = monitor.get_voltage()
                distance = monitor.get_distances()
                
                # Output exactly what Node.js expects
                print(json.dumps({
                    "status": "ok",
                    "type": "voltage",
                    "value": voltage,
                    "unit": "V",
                    "distance": distance,
                }))
                sys.stdout.flush()
                
            if cmd.get("command") == "get_rover_power_stats":
                stats = monitor.get_rover_power_stats()
                distance = monitor.get_distances()
                
                # Output exactly what Node.js expects
                print(json.dumps({
                    "status": "ok",
                    "type": "voltage",
                    "value": stats,
                }))
                sys.stdout.flush()
                
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))
            sys.stdout.flush()