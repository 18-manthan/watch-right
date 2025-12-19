from sqlalchemy.orm import Session
from uuid import uuid4

from app.models.event import Event
from app.schemas.event import EventCreate
from app.services.risk_engine import calculate_risk_for_session
from app.services.risk_persistence import save_risk_score
from app.models.session import InterviewSession
def create_event(db: Session, event: EventCreate):
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == event.session_id)
        .first()
    )

    if not session:
        raise ValueError("Invalid session_id")

    if session.status != "ACTIVE":
        raise ValueError("Events are not allowed for this session state")

    # 1. Save event
    db_event = Event(
        id=str(uuid4()),
        session_id=event.session_id,
        event_type=event.event_type.value,
        severity=event.severity.value,
        confidence=event.confidence,
        timestamp=event.timestamp,
    )

    db.add(db_event)
    db.commit()
    db.refresh(db_event)

    # 2. Recalculate risk
    risk_result = calculate_risk_for_session(db, event.session_id)

    # 3. Persist latest risk score
    save_risk_score(
        db=db,
        session_id=event.session_id,
        score=risk_result["risk_score"],
        level=risk_result["risk_level"],
    )

    return db_event, risk_result
