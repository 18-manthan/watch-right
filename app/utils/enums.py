from enum import Enum


class EventType(str, Enum):
    FACE_DETECTED = "FACE_DETECTED"
    FACE_MISSING = "FACE_MISSING"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    TAB_SWITCH = "TAB_SWITCH"
    WINDOW_BLUR = "WINDOW_BLUR"
    WINDOW_FOCUS = "WINDOW_FOCUS"


class SeverityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
