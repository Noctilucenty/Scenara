"""
Sentry initialization for the FastAPI backend.

Why this lives in its own module:
- init_sentry() is called from main.py BEFORE `create_app()` runs so that
  sentry_sdk instruments asyncio, requests, and SQLAlchemy before any
  application code imports them. Putting it in main.py directly would
  tangle the startup order with other init code.
- The scrub_before_send() hook keeps auth tokens + user passwords out of
  Sentry even if they leak into request metadata. Sentry's default PII
  scrubbing is decent but we don't want to rely on it for auth headers.

Free tier budget: 5,000 errors/month. With 10% transaction sampling we
should comfortably stay under. If we ever get loud, drop sampling to 5%.
"""
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def _scrub_before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Strip auth tokens from Sentry events before transmission.

    Sentry captures request headers by default. We explicitly redact the
    Authorization header (JWT bearer token) and any password-like fields
    that slip through from request bodies.
    """
    request = event.get("request") or {}
    headers = request.get("headers") or {}
    for key in list(headers.keys()):
        if key.lower() in ("authorization", "cookie", "x-api-key"):
            headers[key] = "[redacted]"

    # Strip password-like fields from POST bodies (login, register, etc.)
    data = request.get("data")
    if isinstance(data, dict):
        for key in list(data.keys()):
            if "password" in key.lower() or "secret" in key.lower() or "token" in key.lower():
                data[key] = "[redacted]"

    return event


def init_sentry() -> bool:
    """Initialize Sentry if SENTRY_DSN is set. Returns True if initialized.

    Safe to call multiple times — sentry_sdk.init is idempotent.
    Keep this synchronous and dependency-light: it runs at import time of main.py
    before the FastAPI app exists.
    """
    # Import settings lazily so this module doesn't force env-var parsing at import
    from app.config import settings

    if not settings.sentry_dsn:
        logger.info("[Sentry] SENTRY_DSN not set — error reporting disabled.")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        logger.warning("[Sentry] sentry-sdk not installed — skipping init.")
        return False

    release = (
        os.environ.get("RENDER_GIT_COMMIT")
        or os.environ.get("GIT_COMMIT")
        or "local"
    )

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        release=release,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        profiles_sample_rate=settings.sentry_profiles_sample_rate,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            StarletteIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
            # Capture logger.error() calls as Sentry events, but don't
            # duplicate as breadcrumbs (Starlette already adds request breadcrumbs)
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        send_default_pii=False,
        max_breadcrumbs=25,
        before_send=_scrub_before_send,
        attach_stacktrace=True,
    )
    logger.info("[Sentry] Initialized for env=%s release=%s", settings.app_env, release)
    return True


def set_user_context(user_id: int | None, email: str | None = None) -> None:
    """Tag the current Sentry scope with the authenticated user.

    Called from the auth dependency after token validation so every
    subsequent error in that request is linked to the user.
    """
    try:
        import sentry_sdk
    except ImportError:
        return
    if user_id is None:
        sentry_sdk.set_user(None)
    else:
        sentry_sdk.set_user({"id": str(user_id), "email": email} if email else {"id": str(user_id)})
