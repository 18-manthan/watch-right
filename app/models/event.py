from sqlalchemy import Column, String, DateTime, Float
from app.core.database import Base
from datetime import datetime


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, index=True)

    event_type = Column(String, index=True)
    severity = Column(String)
    confidence = Column(Float, nullable=True)

    timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
