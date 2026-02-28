import cv2
import numpy as np
import onnxruntime as ort
import os

# --- CONFIG ---
RTSP_URL = "rtsp://127.0.0.1:8554/cam"
MODEL_PATH = "depth_anything_v2_vits.onnx"
# How many pixels high the "horizon strip" should be (higher = more vertical context)
STRIP_HEIGHT = 100 

# Speed up ONNX on Pi
os.environ["OMP_NUM_THREADS"] = "4" 

class HorizonDepth:
    def __init__(self, model_path):
        # Optimize session for speed over precision
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        
        self.session = ort.InferenceSession(
            model_path, 
            sess_options, 
            providers=['CPUExecutionProvider']
        )
        self.input_name = self.session.get_inputs()[0].name
        
        # Pre-calculated normalization arrays
        self.mean = np.array([0.485, 0.456, 0.406]).reshape(3, 1, 1).astype(np.float32)
        self.std = np.array([0.229, 0.224, 0.225]).reshape(3, 1, 1).astype(np.float32)

    def get_obstacle_slice(self, frame):
        h, w = frame.shape[:2]
        
        # 1. CROP: Get the middle horizon strip (where obstacles usually are)
        # This reduces data sent to the model significantly
        start_y = (h // 2) - (STRIP_HEIGHT // 2)
        end_y = start_y + STRIP_HEIGHT
        strip = frame[start_y:end_y, :]

        # 2. LIGHTWEIGHT PREP: Resize to model width, but keep height small
        # Note: Models usually expect squares, but we can pad or stretch 
        # to save on total pixel compute.
        img = cv2.cvtColor(strip, cv2.COLOR_BGR2RGB)
        img_input = cv2.resize(img, (518, 518)) / 255.0
        
        # 3. NORMALIZE & INFER
        img_input = (img_input.transpose(2, 0, 1) - self.mean) / self.std
        img_input = img_input.astype(np.float32)[None, ...]

        depth = self.session.run(None, {self.input_name: img_input})[0]
        
        # 4. POST-PROCESS: Get a 1D "Danger Array"
        # We take the average depth of each vertical column in our slice
        depth_map = depth.squeeze() # (518, 518)
        
        # Normalize 0-255 (Closer = Higher Value/Brighter)
        depth_norm = (depth_map - depth_map.min()) / (depth_map.max() - depth_map.min() + 1e-5)
        
        # Take the mean of the bottom 20% of the map (closest to the rover floor)
        # This acts like a 'laser scan' 
        danger_line = np.mean(depth_norm[400:, :], axis=0) 
        
        return (danger_line * 255).astype(np.uint8)

if __name__ == "__main__":
    cap = cv2.VideoCapture(RTSP_URL)
    depth_engine = HorizonDepth(MODEL_PATH)

    print("Driving Mode: Detecting obstacles on horizon...")

    while True:
        ret, frame = cap.read()
        if not ret: break

        start_time = os.times().elapsed
        danger_scan = depth_engine.get_obstacle_slice(frame)
        
        # LOGIC: If any part of the scan is too "bright", something is close!
        # Splitting the scan into Left, Center, Right zones
        sections = np.array_split(danger_scan, 3)
        left_dist = np.mean(sections[0])
        mid_dist = np.mean(sections[1])
        right_dist = np.mean(sections[2])

        if mid_dist > 200: # Threshold for "Too Close"
            print(f"!!! STOP !!! Obstacle ahead: {mid_dist:.1f}")
        else:
            print(f"Clear Path - L:{left_dist:.0f} M:{mid_dist:.0f} R:{right_dist:.0f}")

        # Visual feedback for debugging (save one line)
        cv2.imwrite("horizon_scan.png", danger_scan.reshape(1, -1))