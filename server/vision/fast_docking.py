import cv2
import cv2.aruco as aruco
import numpy as np
import json
import sys
import time
import threading

# --- CONFIG ---
STREAM_URL = "rtsp://127.0.0.1:8554/cam"
MARKER_SIZE = 5.0 
MARKER_GAP_OFFSET = 10.0 

# COORDINATE SCALING
# Capture at 1280x720, process at 640x360 (0.5 scale)
PROCESS_SCALE = 0.5
INV_SCALE = 1.0 / PROCESS_SCALE

# Camera Matrix calibrated for 640x360 (halved from original 720p params)
CAMERA_MATRIX = np.array([[600, 0, 320], [0, 600, 180], [0, 0, 1]], dtype=float)
DIST_COEFFS = np.zeros((5, 1))

class FastDocker:
    def __init__(self):
        cv_ver = cv2.__version__.split('.')
        self.is_legacy = int(cv_ver[0]) < 4 or (int(cv_ver[0]) == 4 and int(cv_ver[1]) < 7)
        
        if self.is_legacy:
            self.aruco_dict = aruco.Dictionary_get(aruco.DICT_4X4_50)
            self.parameters = aruco.DetectorParameters_create()
        else:
            self.aruco_dict = aruco.getPredefinedDictionary(aruco.DICT_4X4_50)
            self.parameters = aruco.DetectorParameters()
            self.detector = aruco.ArucoDetector(self.aruco_dict, self.parameters)
        
        self.cap = cv2.VideoCapture(STREAM_URL, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1) 
        
        self.marker_3d = np.array([
            [-MARKER_SIZE / 2,  MARKER_SIZE / 2, 0],
            [ MARKER_SIZE / 2,  MARKER_SIZE / 2, 0],
            [ MARKER_SIZE / 2, -MARKER_SIZE / 2, 0],
            [-MARKER_SIZE / 2, -MARKER_SIZE / 2, 0]
        ], dtype=np.float32)

        self.latest_pose = {"status": "lost"}
        self.stopped = False

    def start(self):
        t = threading.Thread(target=self._run_loop, daemon=True)
        t.start()

    def get_latest_pose(self):
        return self.latest_pose

    def stop(self):
        self.stopped = True
        if self.cap: self.cap.release()

    def _run_loop(self):
        while not self.stopped:
            # Drain buffer to stop lag
            for _ in range(4): self.cap.grab()
            
            ret, frame = self.cap.retrieve()
            if not ret:
                time.sleep(0.01)
                continue
            
            # Resize 720p -> 360p for speed
            small = cv2.resize(frame, (0,0), fx=PROCESS_SCALE, fy=PROCESS_SCALE)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            
            if self.is_legacy:
                corners, ids, _ = aruco.detectMarkers(gray, self.aruco_dict, parameters=self.parameters)
            else:
                corners, ids, _ = self.detector.detectMarkers(gray)

            if ids is not None:
                poses = []
                ui_markers = []
                for i in range(len(ids)):
                    success, rvec, tvec = cv2.solvePnP(self.marker_3d, corners[i], CAMERA_MATRIX, DIST_COEFFS)
                    if success:
                        rmat, _ = cv2.Rodrigues(rvec)
                        m_x, m_z = tvec[0][0], tvec[2][0]
                        if ids[i][0] == 10: m_x += MARKER_GAP_OFFSET
                        elif ids[i][0] == 11: m_x -= MARKER_GAP_OFFSET
                        
                        yaw = np.degrees(np.arctan2(-rmat[2, 0], rmat[2, 2]))
                        poses.append({"x": m_x, "z": m_z, "yaw": yaw})
                        
                        # Scale corners back to 720p (1280x720) for React UI
                        points_720p = (corners[i][0] * INV_SCALE).tolist()
                        ui_markers.append({"id": int(ids[i][0]), "points": points_720p})

                if poses:
                    self.latest_pose = {
                        "status": "found",
                        "x": round(float(np.mean([p['x'] for p in poses])), 2),
                        "z": round(float(np.mean([p['z'] for p in poses])), 2),
                        "yaw": round(float(np.mean([p['yaw'] for p in poses])), 2),
                        "markers": ui_markers
                    }
            else:
                self.latest_pose = {"status": "lost"}