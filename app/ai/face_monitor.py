import cv2
import mediapipe as mp
import time


class FaceMonitor:
    def __init__(self, missing_threshold_sec=2):
        self.mp_face = mp.solutions.face_detection
        self.detector = self.mp_face.FaceDetection(
            model_selection=0,
            min_detection_confidence=0.6
        )

        self.last_face_time = time.time()
        self.missing_threshold = missing_threshold_sec

    def process_frame(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.detector.process(rgb)

        face_count = 0
        if result.detections:
            face_count = len(result.detections)
            self.last_face_time = time.time()

        events = []

        # MULTIPLE FACES
        if face_count > 1:
            events.append("MULTIPLE_FACES")

        # FACE MISSING
        if face_count == 0:
            elapsed = time.time() - self.last_face_time
            if elapsed >= self.missing_threshold:
                events.append("FACE_MISSING")

        return events
