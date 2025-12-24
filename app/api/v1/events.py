from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.event import EventCreate
from app.core.database import get_db
from app.services.event_service import create_event

router = APIRouter()


@router.post("/events")
async def ingest_event(
    event: EventCreate,
    db: Session = Depends(get_db)
):
    try:
        saved_event, risk_result = create_event(db, event)
        return {
            "event_id": saved_event.id,
            "session_id": event.session_id,
            "current_risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))