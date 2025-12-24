from sqlalchemy import Column, String, DateTime, Float
from app.core.database import Base
from datetime import datetime
from pydantic import BaseModel
from datetime import datetime
from app.utils.enums import EventType, SeverityLevel


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, index=True)

    event_type = Column(String, index=True)
    severity = Column(String)
    confidence = Column(Float, nullable=True)

    timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class EventCreate(BaseModel):
    session_id: str
    event_type: EventType
    severity: SeverityLevel
    confidence: float | None = None
    timestamp: datetime

class EventResponse(BaseModel):
    id: str
    session_id: str
    event_type: EventType
    severity: SeverityLevel
    confidence: float | None
    timestamp: datetime

    class Config:
        from_attributes = True
