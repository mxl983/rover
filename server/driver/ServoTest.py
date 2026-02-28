import time
from adafruit_servokit import ServoKit

# Initialize the PCA9685
try:
    kit = ServoKit(channels=16)
    
    print("Resetting all 16 channels to 90 degrees (Center)...")
    
    kit.servo[3].actuation_range = 180
    kit.servo[7].actuation_range = 180
    
    # H
    kit.servo[3].angle = 90
    time.sleep(0.5) 
    kit.servo[3].angle = None
    kit.servo[7].angle = 90
    time.sleep(0.5)
    kit.servo[7].angle = None

    
    # for i in range(7):
    #     # Move to center
    #     kit.servo[i].angle = 130
    #     # Optional: set to None after a brief delay to stop the jitter/buzzing
    #     time.sleep(0.2) 
    #     kit.servo[i].angle = None 

    # print("Reset Complete. All servos should be centered.")

except Exception as e:
    print(f"Error communicating with the PCA9685: {e}")
    print("Check if i2cdetect -y 1 still shows address 40.")