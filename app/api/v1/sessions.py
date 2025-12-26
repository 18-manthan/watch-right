from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pathlib import Path
import base64
import os
import shutil

from app.core.database import get_db
from app.services.session_service import (
    create_session,
    start_session,
    end_session,
)

router = APIRouter()

# Session APIs
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


# Auth Snapshot (Face Gate)
@router.post("/sessions/{session_id}/auth-snapshot")
def save_auth_snapshot(session_id: str, payload: dict):
    image_base64 = payload["image_base64"]

    # Remove base64 header
    image_data = image_base64.split(",")[1]
    image_bytes = base64.b64decode(image_data)

    dir_path = "virtual/auth_snapshots"
    os.makedirs(dir_path, exist_ok=True)

    path = f"{dir_path}/{session_id}.jpg"

    with open(path, "wb") as f:
        f.write(image_bytes)

    return {
        "status": "saved",
        "path": path
    }


# ==============================
# Screen Recording Upload
# ==============================

UPLOAD_DIR = Path("virtual/screen_recordings")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/sessions/{session_id}/screen-recording")
async def upload_screen_recording(
    session_id: str,
    file: UploadFile = File(...)
):
    if not file.filename.endswith(".webm"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    file_path = UPLOAD_DIR / f"{session_id}.webm"

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        file.file.close()

    return {
        "status": "saved",
        "session_id": session_id,
        "path": str(file_path)
    }
