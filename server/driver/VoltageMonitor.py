import IIC
import sys
import json
import time

# Register for battery voltage on this driver board
REG_BATTERY_VOLTAGE = 0x1B

class VoltageMonitor:
    def __init__(self):
        # Ensure the motor type is set so the board's internal ADCs are active
        IIC.set_motor_parameter()

    def get_voltage(self):
        try:
            # Read 2 bytes (High and Low) from the voltage register
            data = IIC.i2c_read(IIC.MOTOR_MODEL_ADDR, REG_BATTERY_VOLTAGE, 2)
            # Combine bytes into a 16-bit value (millivolts)
            voltage_mv = (data[0] << 8) | data[1]
            return round(voltage_mv / 1000.0, 2)  # Convert to Volts
        except Exception as e:
            return None

if __name__ == "__main__":
    monitor = VoltageMonitor()
    
    # Listen for a 'check' command from Node.js
    for line in sys.stdin:
        try:
            cmd = json.loads(line)
            if cmd.get("command") == "get_voltage":
                voltage = monitor.get_voltage()
                print(json.dumps({
                    "status": "ok",
                    "type": "voltage",
                    "value": voltage,
                    "unit": "V"
                }))
                sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))
            sys.stdout.flush()