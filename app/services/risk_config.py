from app.utils.enums import EventType

RISK_RULES = {
    EventType.FACE_MISSING: {
        "score": 20,
        "max_hits": 3,
    },
    EventType.MULTIPLE_FACES: {
        "score": 20,
        "max_hits": 1,
    },
    EventType.TAB_SWITCH: {
        "score": 10,
        "max_hits": 5,
    },
    EventType.WINDOW_BLUR: {
        "score": 10,
        "max_hits": 5,
    },
}

RISK_THRESHOLDS = {
    "NORMAL": 0,
    "SUSPICIOUS": 40,
    "HIGH_RISK": 70,
}
