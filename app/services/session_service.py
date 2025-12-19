from sqlalchemy.orm import Session
from datetime import datetime
from uuid import uuid4

from app.models.session import InterviewSession


def create_session(db: Session) -> InterviewSession:
    session = InterviewSession(
        id=str(uuid4()),
        status="CREATED",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def start_session(db: Session, session_id: str) -> InterviewSession:
    session = db.query(InterviewSession).filter_by(id=session_id).first()
    if not session:
        raise ValueError("Session not found")

    if session.status != "CREATED":
        raise ValueError("Session cannot be started")

    session.status = "ACTIVE"
    session.started_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


def end_session(db: Session, session_id: str) -> InterviewSession:
    session = db.query(InterviewSession).filter_by(id=session_id).first()
    if not session:
        raise ValueError("Session not found")

    if session.status != "ACTIVE":
        raise ValueError("Session cannot be ended")

    session.status = "ENDED"
    session.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session
