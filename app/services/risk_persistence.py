from sqlalchemy.orm import Session
from uuid import uuid4
from app.models.risk_score import RiskScore


def save_risk_score(
    db: Session,
    session_id: str,
    score: int,
    level: str
):
    risk = RiskScore(
        id=str(uuid4()),
        session_id=session_id,
        score=score,
        level=level,
    )

    db.add(risk)
    db.commit()
    return risk
