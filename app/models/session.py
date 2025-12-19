from sqlalchemy import Column, String, DateTime
from datetime import datetime
from app.core.database import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(String, primary_key=True, index=True)
    status = Column(String, default="CREATED")  # CREATED | ACTIVE | ENDED

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)