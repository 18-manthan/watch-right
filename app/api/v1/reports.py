from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.risk_engine import calculate_risk_for_session
from app.models.risk_score import RiskScore

router = APIRouter()


@router.get("/reports/{session_id}")
async def get_full_report(
    session_id: str,
    db: Session = Depends(get_db)
):
    return calculate_risk_for_session(db, session_id)


@router.get("/reports/{session_id}/latest")
async def get_latest_risk(
    session_id: str,
    db: Session = Depends(get_db)
):
    latest = (
        db.query(RiskScore)
        .filter(RiskScore.session_id == session_id)
        .order_by(RiskScore.created_at.desc())
        .first()
    )

    if not latest:
        return {"message": "No risk score found"}

    return {
        "session_id": session_id,
        "risk_score": latest.score,
        "risk_level": latest.level,
        "updated_at": latest.created_at.isoformat(),
    }
