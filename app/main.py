from fastapi import FastAPI
from pydantic_settings import BaseSettings
from pydantic import Field

from app.api.v1 import sessions, events, reports

def create_app() -> FastAPI:
    app = FastAPI(
        title="Interview Integrity Monitoring API",
        description="Backend for AI-powered interview integrity monitoring",
        version="1.0.0",
    )

    # Health check
    @app.get("/health", tags=["Health"])
    async def health_check():
        return {"status": "ok"}

    # API Routers
    app.include_router(sessions.router, prefix="/api/v1", tags=["Sessions"])
    app.include_router(events.router, prefix="/api/v1", tags=["Events"])
    app.include_router(reports.router, prefix="/api/v1", tags=["Reports"])

    return app


app = create_app()
