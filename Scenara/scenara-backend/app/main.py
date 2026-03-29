import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, engine

from app.routers.users import router as users_router
from app.routers.events import router as events_router
from app.routers.predictions import router as predictions_router
from app.routers.accounts import router as accounts_router
from app.routers.auth import router as auth_router
from app.routers.news import router as news_router
from app.routers.comments import router as comments_router
from app.routers.push import router as push_router
from app.routers.voting import router as voting_router

from app.services.event_generator import run_snapshot, run_event_generator, start_scheduler
from app.services.auto_resolver import run_auto_resolver, start_auto_resolver
from app.services.news_market_generator import run_news_market_generator, start_news_market_scheduler

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.6.0", debug=settings.app_debug)

    cors_allow_origins = [
        "http://localhost:8081", "http://127.0.0.1:8081",
        "http://localhost:19006", "http://127.0.0.1:19006",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=86400,
    )

    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request as StarletteRequest

    class CacheHeaderMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: StarletteRequest, call_next):
            response = await call_next(request)
            path = request.url.path
            # Cache events list for 30s, history for 5min, news for 1hr
            if path == "/events/" and request.method == "GET":
                response.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=60"
            elif "/history" in path and request.method == "GET":
                response.headers["Cache-Control"] = "public, max-age=300"
            elif path.startswith("/news") and request.method == "GET":
                response.headers["Cache-Control"] = "public, max-age=3600"
            return response

    app.add_middleware(CacheHeaderMiddleware)

    @app.on_event("startup")
    async def _startup() -> None:
        Base.metadata.create_all(bind=engine)
        asyncio.create_task(start_scheduler())
        asyncio.create_task(start_auto_resolver())
        asyncio.create_task(start_news_market_scheduler())
        logger.info("[Startup] Scenara backend v0.7.0 ready.")

    @app.get("/", tags=["health"])
    def health():
        return {"status": "ok", "name": settings.app_name, "version": "0.7.0"}

    @app.get("/health", tags=["health"])
    @app.head("/health", tags=["health"])
    def health_check():
        try:
            from sqlalchemy import text as sql_text
            with engine.connect() as conn:
                conn.execute(sql_text("SELECT 1"))
            db_ok = True
        except Exception:
            db_ok = False
        return {"ok": True, "db": db_ok, "version": "0.7.0"}

    @app.post("/admin/generate-events", tags=["admin"])
    async def trigger_event_generation():
        await run_event_generator()
        return {"ok": True, "message": "Events generated"}

    @app.post("/admin/generate-news-markets", tags=["admin"])
    async def trigger_news_markets():
        created = await run_news_market_generator()
        return {"ok": True, "created": created, "message": f"Generated {created} news markets"}

    @app.post("/admin/snapshot", tags=["admin"])
    async def trigger_snapshot():
        await run_snapshot()
        return {"ok": True, "message": "Snapshot logged"}

    @app.post("/admin/resolve-expired", tags=["admin"])
    async def trigger_auto_resolve():
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

    return app


app = create_app()