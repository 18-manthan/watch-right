from pydantic import BaseModel
from datetime import datetime
from app.utils.enums import EventType, SeverityLevel


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