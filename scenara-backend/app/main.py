import asyncio
import logging

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, engine

from app.routers.users import router as users_router
from app.routers.events import router as events_router
from app.routers.predictions import router as predictions_router
from app.routers.accounts import router as accounts_router
from app.routers.auth import router as auth_router, get_current_user
from app.routers.news import router as news_router
from app.routers.comments import router as comments_router
from app.routers.push import router as push_router
from app.routers.voting import router as voting_router
from app.routers.admin import router as admin_router
from app.models.user import User

from app.services.event_generator import run_snapshot, run_event_generator, start_scheduler
from app.services.auto_resolver import run_auto_resolver, start_auto_resolver

logger = logging.getLogger(__name__)


def _migrate_is_admin_column() -> None:
    """Idempotent: add is_admin column to users table if missing."""
    from sqlalchemy import text as sql_text, inspect
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns("users")]
    if "is_admin" not in cols:
        with engine.begin() as conn:
            conn.execute(sql_text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
        logger.info("[Migration] Added is_admin column to users.")


def _migrate_brazil_category() -> None:
    """One-time idempotent migration: set category='brazil' for all Brazil-specific events."""
    from sqlalchemy import text as sql_text
    brazil_slugs = [
        "copa-brasil-flamengo", "world-cup-2026-brazil", "libertadores-2026",
        "brazil-5g-coverage", "trump-tariffs-brazil", "ufc-next-brazilian-champ",
    ]
    placeholders = ", ".join(f"'{s}'" for s in brazil_slugs)
    with engine.begin() as conn:
        # All events whose slug starts with "br-"
        conn.execute(sql_text(
            "UPDATE events SET category = 'brazil' WHERE slug LIKE 'br-%' AND category != 'brazil'"
        ))
        # Specific non-br- slugs that are also Brazilian
        conn.execute(sql_text(
            f"UPDATE events SET category = 'brazil' WHERE slug IN ({placeholders}) AND category != 'brazil'"
        ))
    logger.info("[Migration] brazil category sync complete.")


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.6.0", debug=settings.app_debug)

    cors_allow_origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_allow_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
        max_age=86400,
    )

    @app.on_event("startup")
    async def _startup() -> None:
        Base.metadata.create_all(bind=engine)
        _migrate_is_admin_column()
        _migrate_brazil_category()
        asyncio.create_task(start_scheduler())
        asyncio.create_task(start_auto_resolver())
        logger.info("[Startup] Scenara backend v0.6.0 ready.")

    @app.get("/", tags=["health"])
    def health():
        return {"status": "ok", "name": settings.app_name, "version": "0.6.0"}

    @app.get("/health", tags=["health"])
    @app.head("/health", tags=["health"])
    def health_check():
        # Check DB is reachable
        try:
            from sqlalchemy import text as sql_text
            with engine.connect() as conn:
                conn.execute(sql_text("SELECT 1"))
            db_ok = True
        except Exception:
            db_ok = False
        return {"ok": True, "db": db_ok, "version": "0.6.0"}

    @app.post("/admin/generate-events", tags=["admin"])
    async def trigger_event_generation(current_user: User = Depends(get_current_user)):
        await run_event_generator()
        return {"ok": True, "message": "Events generated"}

    @app.post("/admin/snapshot", tags=["admin"])
    async def trigger_snapshot(current_user: User = Depends(get_current_user)):
        await run_snapshot()
        return {"ok": True, "message": "Snapshot logged"}

    @app.post("/admin/resolve-expired", tags=["admin"])
    async def trigger_auto_resolve(current_user: User = Depends(get_current_user)):
        await run_auto_resolver()
        return {"ok": True, "message": "Auto-resolution complete"}

    app.include_router(auth_router,        prefix="/auth",        tags=["auth"])
    app.include_router(users_router,       prefix="/users",       tags=["users"])
    app.include_router(events_router,      prefix="/events",      tags=["events"])
    app.include_router(predictions_router, prefix="/predictions",  tags=["predictions"])
    app.include_router(accounts_router,    prefix="/accounts",    tags=["accounts"])
    app.include_router(news_router,        prefix="/news",        tags=["news"])
    app.include_router(comments_router,    prefix="/comments",    tags=["comments"])
    app.include_router(push_router,        prefix="/push",        tags=["push"])
    app.include_router(voting_router,      prefix="/voting",      tags=["voting"])
    app.include_router(admin_router,       prefix="/admin",       tags=["admin"])

    return app


app = create_app()