import sys
import json
import time
import math
from fast_docking import FastDocking # Import your optimized class

class VisionManager:
    def __init__(self):
        self.rtsp_url = "rtsp://127.0.0.1:8554/cam"
        # We don't start the camera until a command is received to save battery
        self.dock_util = None

    def get_docking_data(self):
        # Lazy initialization: start the camera thread only when requested
        if self.dock_util is None:
            self.dock_util = FastDocking(self.rtsp_url)
        
        # Try to grab a fresh position
        result = self.dock_util.get_position()
        
        if result:
            return {"status": "found", "data": result}
        return {"status": "not_found"}

    def stop_vision(self):
        if self.dock_util:
            self.dock_util.stop()
            self.dock_util = None
        return {"status": "vision_stopped"}

if __name__ == "__main__":
    manager = VisionManager()
    
    # Standard input loop for Node.js communication
    for line in sys.stdin:
        try:
            cmd = json.loads(line.strip())
            command = cmd.get("command")
            
            if command == "get_docking_status":
                result = manager.get_docking_data()
                print(json.dumps({
                    "status": "ok",
                    "type": "docking",
                    "result": result
                }))
                sys.stdout.flush()
                
            elif command == "stop_vision":
                # Call this when docking mode is turned off to save CPU/Battery
                res = manager.stop_vision()
                print(json.dumps({
                    "status": "ok",
                    "type": "control",
                    "result": res
                }))
                sys.stdout.flush()
                
        except Exception as e:
            # Send errors back as JSON so Express doesn't crash
            sys.stderr.write(f"Vision Error: {e}\n")
            print(json.dumps({"status": "error", "message": str(e)}))
            sys.stdout.flush()