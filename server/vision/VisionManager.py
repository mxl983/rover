import sys
import json
import logging
from fast_docking import FastDocker

logging.basicConfig(stream=sys.stderr, level=logging.INFO, format='%(asctime)s - %(message)s')

class VisionManager:
    def __init__(self):
        self.dock_util = None

    def handle_command(self, cmd):
        command = cmd.get("command")
        if command == "get_docking_status":
            if not self.dock_util:
                self.dock_util = FastDocker()
                self.dock_util.start()
            return {"type": "docking", "result": self.dock_util.get_latest_pose()}
        elif command == "stop_vision":
            if self.dock_util:
                self.dock_util.stop()
                self.dock_util = None
            return {"type": "control", "result": "stopped"}
        return {"type": "error", "message": "Unknown command"}

if __name__ == "__main__":
    manager = VisionManager()
    while True:
        line = sys.stdin.readline()
        if not line: break
        try:
            data = json.loads(line.strip())
            sys.stdout.write(json.dumps(manager.handle_command(data)) + "\n")
            sys.stdout.flush()
        except Exception as e:
            logging.error(f"Manager Error: {e}")