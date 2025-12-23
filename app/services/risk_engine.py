from sqlalchemy.orm import Session
from collections import defaultdict
from app.models.event import Event
from app.services.risk_config import RISK_RULES, RISK_THRESHOLDS
from app.utils.enums import EventType
from collections import defaultdict



def calculate_risk_for_session(db: Session, session_id: str) -> dict:
    event_counts = defaultdict(int)
    events = (
        db.query(Event)
        .filter(Event.session_id == session_id)
        .order_by(Event.timestamp.asc())
        .all()
    )

    score = 0
    reasons = []
    hit_counter = defaultdict(int)

    for event in events:
        event_type = EventType(event.event_type)

        # ✅ Count every event
        event_counts[event_type] += 1

        if event_type not in RISK_RULES:
            continue

        rule = RISK_RULES[event_type]

        if hit_counter[event_type] >= rule["max_hits"]:
            continue

        score += rule["score"]
        hit_counter[event_type] += 1

        reasons.append({
            "event_type": event_type.value,
            "timestamp": event.timestamp.isoformat(),
            "score_added": rule["score"],
        })


    risk_level = determine_risk_level(score)

    return {
        "session_id": session_id,
        "risk_score": score,
        "risk_level": risk_level,
        "event_counts": {
            "tab_switch_count": event_counts.get(EventType.TAB_SWITCH, 0),
            "window_blur_count": event_counts.get(EventType.WINDOW_BLUR, 0),
            "face_missing_count": event_counts.get(EventType.FACE_MISSING, 0),
        },
        "reasons": reasons,
    }


def determine_risk_level(score: int) -> str:
    if score >= RISK_THRESHOLDS["HIGH_RISK"]:
        return "HIGH_RISK"
    elif score >= RISK_THRESHOLDS["SUSPICIOUS"]:
        return "SUSPICIOUS"
    return "NORMAL"
