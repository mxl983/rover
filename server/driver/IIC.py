import smbus
import struct
import time

# --- INITIALIZATION ---
bus = smbus.SMBus(1)
ADDR = 0x26

# Register Map
REG_TYPE = 0x01
REG_DEADZONE = 0x02
REG_PULSE_LINE = 0x03
REG_PULSE_PHASE = 0x04
REG_WHEEL_DIA = 0x05
REG_SPEED_CTRL = 0x06
REG_ENCODER_ALL = 0x20  # Start of 32-bit encoder registers
REG_BATTERY_VOLTAGE = 0x1B


def i2c_write(reg, data):
  bus.write_i2c_block_data(ADDR, reg, data)


def set_520_motor_params():
  """Configures the driver specifically for 520 motor specs"""
  print("Configuring 520 motor parameters...")
  i2c_write(REG_TYPE, [1])                 # Type 1: 520 Motor
  time.sleep(0.1)
  i2c_write(REG_PULSE_PHASE, [0, 30])      # Reduction Ratio: 30
  time.sleep(0.1)
  i2c_write(REG_PULSE_LINE, [0, 11])       # Magnetic poles: 11
  time.sleep(0.1)
  # Wheel Diameter 67.0mm (Float to bytes)
  i2c_write(REG_WHEEL_DIA, list(struct.pack('<f', 67.00)))
  time.sleep(0.1)
  i2c_write(REG_DEADZONE, [1600 >> 8, 1600 & 0xFF])  # Deadzone: 1600
  time.sleep(0.1)
  print("Configuration complete.")


def control_speed(m1, m2, m3, m4):
  """Sends target velocity to the onboard PID controller"""
  speeds = [
      (m1 >> 8) & 0xFF, m1 & 0xFF,
      (m2 >> 8) & 0xFF, m2 & 0xFF,
      (m3 >> 8) & 0xFF, m3 & 0xFF,
      (m4 >> 8) & 0xFF, m4 & 0xFF
  ]
  i2c_write(REG_SPEED_CTRL, speeds)


def read_encoders():
  """Reads 32-bit accumulated encoder data for all 4 motors"""
  results = []
  for i in range(4):
    # Read 4 bytes (High word + Low word)
    data = bus.read_i2c_block_data(ADDR, REG_ENCODER_ALL + (i * 2), 4)
    val = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]
    # Handle 32-bit signed integer
    if val >= 0x80000000:
      val -= 0x100000000
    results.append(val)
  return results

def get_distance_traveled_mm():
    """
    Calculates distance in millimeters for each wheel.
    Uses the 520 motor specs: 11 poles * 30 reduction ratio = 330 ticks/rev.
    Wheel diameter is 67mm.
    """
    ticks = read_encoders()
    
    # 520 Motor Logic: 11 (poles) * 30 (reduction) = 330 ticks per rotation
    ppr = 11 * 30 
    diameter = 67.0
    circumference = diameter * math.pi
    
    # Distance (mm) = (Current Ticks / Ticks per Rev) * Circumference
    distances = [(t / ppr) * circumference for t in ticks]
    return distances

def read_battery_voltage():
    """
    Reads the battery voltage in millivolts (mV) from the driver board.
    Commonly found at register 0x1B for this I2C driver model.
    """
    try:
        # Read 2 bytes from the voltage register
        data = bus.read_i2c_block_data(ADDR, REG_BATTERY_VOLTAGE, 2)
        voltage_mv = (data[0] << 8) | data[1]
        return voltage_mv / 1000.0  # Convert to Volts (V)
    except:
        return 0.0 # Return 0 if the board model doesn't support voltage reading
      

# --- MAIN EXECUTION ---
if __name__ == "__main__":
  try:
    set_520_motor_params()

    print("Moving forward at speed 500...")
    control_speed(500, 500, 500, 500)

    for _ in range(10):
      encoders = read_encoders()
      print(f"Encoder Ticks: M1:{encoders[0]}, M2:{encoders[1]}")
      time.sleep(0.5)

  except KeyboardInterrupt:
    print("\nStopping motors...")
  finally:
    # Safety: Reset speed to 0 regardless of how script ends
    control_speed(0, 0, 0, 0)
    print("System Halted.")
