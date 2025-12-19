from sqlalchemy import Column, String, Integer, DateTime
from datetime import datetime
from app.core.database import Base


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, index=True)

    score = Column(Integer)
    level = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)
