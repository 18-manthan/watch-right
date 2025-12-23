import cv2
import time
import requests
from datetime import datetime

from face_monitor import FaceMonitor

API_URL = "http://127.0.0.1:8000/api/v1/events"
SESSION_ID = "<PUT_ACTIVE_SESSION_ID_HERE>"

monitor = FaceMonitor(missing_threshold_sec=2.0)
# cap = cv2.VideoCapture(0)
# cap = cv2.VideoCapture("/dev/video1", cv2.CAP_V4L2)
cap = cv2.VideoCapture(
    "v4l2src device=/dev/video1 ! videoconvert ! appsink",
    cv2.CAP_GSTREAMER
)


if not cap.isOpened():
    raise RuntimeError("Could not open camera")

print("Face worker started. Press Ctrl+C to stop.")

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        events = monitor.process_frame(frame)

        for event in events:
            payload = {
                "session_id": SESSION_ID,
                "event_type": event,
                "severity": "HIGH",
                "confidence": 0.9,
                "timestamp": datetime.utcnow().isoformat(),
            }

            requests.post(API_URL, json=payload, timeout=2)

        time.sleep(0.5)  # sampling interval

except KeyboardInterrupt:
    print("Stopping face worker...")
finally:
    cap.release()
