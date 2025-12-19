from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.session_service import (
    create_session,
    start_session,
    end_session,
)

router = APIRouter()


@router.post("/sessions")
async def create_interview_session(db: Session = Depends(get_db)):
    session = create_session(db)
    return {
        "session_id": session.id,
        "status": session.status,
        "created_at": session.created_at,
    }


@router.post("/sessions/{session_id}/start")
async def start_interview_session(
    session_id: str,
    db: Session = Depends(get_db),
):
    try:
        session = start_session(db, session_id)
        return {
            "session_id": session.id,
            "status": session.status,
            "started_at": session.started_at,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sessions/{session_id}/end")
async def end_interview_session(
    session_id: str,
    db: Session = Depends(get_db),
):
    try:
        session = end_session(db, session_id)
        return {
            "session_id": session.id,
            "status": session.status,
            "ended_at": session.ended_at,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
