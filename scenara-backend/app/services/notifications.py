"""
app/services/notifications.py

Fan-out push notifications to all of a user's active devices.

Two transports, picked per device.platform:
  - "expo":  Expo Push API. Native iOS/Android. Free tier; no auth required
             but accepts an EXPO_ACCESS_TOKEN for higher rate limits.
  - "web":   W3C Web Push (VAPID). Browser push for the Vercel-hosted PWA.
             Token is the JSON-serialized PushSubscription.

Design notes:
- send_to_user(...) is the ONLY public entry point. It checks the per-pref
  flag on the User row before fanning out — so callers don't have to remember
  which preference gates which notification type.
- Each transport call is best-effort and isolated: a failure on one device
  never blocks the others. We mark a device inactive on hard errors
  (DeviceNotRegistered / 410 Gone) so we stop wasting attempts.
- All HTTP calls are fire-and-forget from the caller's perspective: we
  schedule them on a background thread so the API request that triggered
  the notification (settle, follow, etc.) returns fast.
- pywebpush is an optional dependency. If it's not installed (e.g., local
  dev), web devices are silently skipped — no import errors at startup.
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any, Iterable

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models.device_token import DeviceToken
from app.models.user import User

logger = logging.getLogger(__name__)


# Map preference enum → User column name. Keeps callers honest:
# send_to_user must always specify which preference gates the notification.
_PREF_COLUMN = {
    "settled":      "notify_settled",
    "followers":    "notify_followers",
    "closing":      "notify_closing",
    "weekly_recap": "notify_weekly_recap",
}


# ── Public API ────────────────────────────────────────────────────────────────

def send_to_user(
    user_id: int,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    pref: str | None = None,
) -> None:
    """
    Schedule a push notification to user_id on a background thread.

    Returns immediately — the actual HTTP fan-out runs async. Safe to call
    from inside a request handler without blocking the response.

    Args:
        user_id:  Target user.
        title:    Notification title (short — 50 chars or less ideal).
        body:     Notification body (one line, ~150 chars).
        data:     Click payload. We expect {"route": "/market-detail",
                  "params": {"id": "..."}} — tap-handler on the client routes.
        pref:     Preference key ("settled" | "followers" | "closing" |
                  "weekly_recap"). If None, sends regardless of prefs (use
                  sparingly — only for transactional / safety messages).
    """
    if pref is not None and pref not in _PREF_COLUMN:
        logger.error("[Notifications] Unknown pref key %r — refusing to send.", pref)
        return

    payload = {
        "user_id": user_id,
        "title": title,
        "body": body,
        "data": data or {},
        "pref": pref,
    }
    # Daemon thread so it doesn't block process shutdown. For production we'd
    # use a proper task queue (Celery / RQ); for our scale a thread is fine
    # and keeps the deploy footprint tiny.
    threading.Thread(target=_send_blocking, args=(payload,), daemon=True).start()


def _send_blocking(payload: dict[str, Any]) -> None:
    """Body of the background thread. Owns its own DB session."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == payload["user_id"]).first()
        if not user:
            return

        # Pref gate. Caller-supplied pref column must be True on the user row.
        pref = payload["pref"]
        if pref is not None:
            col = _PREF_COLUMN[pref]
            if not getattr(user, col, True):
                return

        devices: list[DeviceToken] = (
            db.query(DeviceToken)
            .filter(
                DeviceToken.user_id == payload["user_id"],
                DeviceToken.active.is_(True),
            )
            .all()
        )
        if not devices:
            return

        expo_devices = [d for d in devices if d.platform == "expo"]
        web_devices  = [d for d in devices if d.platform == "web"]

        if expo_devices:
            _send_expo(db, expo_devices, payload)
        if web_devices:
            _send_web(db, web_devices, payload)

    except Exception as e:
        logger.exception("[Notifications] Fan-out failed: %s", e)
    finally:
        db.close()


# ── Expo transport ────────────────────────────────────────────────────────────

def _send_expo(db: Session, devices: Iterable[DeviceToken], payload: dict[str, Any]) -> None:
    """Send to Expo. One HTTP call carries up to 100 messages."""
    messages = [
        {
            "to":    d.token,
            "title": payload["title"],
            "body":  payload["body"],
            "data":  payload["data"],
            "sound": "default",
            "priority": "high",
        }
        for d in devices
    ]
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(settings.expo_push_url, json=messages, headers=headers)
            resp.raise_for_status()
            body = resp.json()
    except Exception as e:
        logger.warning("[Notifications/expo] Push failed: %s", e)
        return

    # Expo returns {"data": [{status: "ok"|"error", ...}, ...]} in receipt order.
    # On status="error" with details.error == "DeviceNotRegistered", the token
    # is dead — disable it.
    receipts = body.get("data") or []
    for device, receipt in zip(devices, receipts):
        if receipt.get("status") == "error":
            err = (receipt.get("details") or {}).get("error", "")
            if err in ("DeviceNotRegistered", "InvalidCredentials"):
                device.active = False
                logger.info("[Notifications/expo] Disabled dead token id=%s", device.id)
    db.commit()


# ── Web Push transport ────────────────────────────────────────────────────────

def _send_web(db: Session, devices: Iterable[DeviceToken], payload: dict[str, Any]) -> None:
    """Send to W3C Web Push subscribers. Requires pywebpush + VAPID keys."""
    if not (settings.vapid_private_key and settings.vapid_public_key):
        # No keys configured → silently skip. Browsers won't even subscribe
        # because the frontend exposes the public key only when set.
        return

    try:
        from pywebpush import webpush, WebPushException  # type: ignore
    except ImportError:
        logger.info("[Notifications/web] pywebpush not installed — skipping.")
        return

    web_payload = json.dumps({
        "title": payload["title"],
        "body":  payload["body"],
        "data":  payload["data"],
    })
    vapid_claims = {"sub": settings.vapid_subject}

    for device in devices:
        try:
            subscription_info = json.loads(device.token)
        except json.JSONDecodeError:
            logger.warning("[Notifications/web] Bad subscription JSON id=%s", device.id)
            device.active = False
            continue

        try:
            webpush(
                subscription_info=subscription_info,
                data=web_payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims=dict(vapid_claims),  # webpush mutates this
            )
        except WebPushException as e:
            # 404 / 410 mean the subscription is gone forever — disable.
            status = getattr(e.response, "status_code", None) if e.response else None
            if status in (404, 410):
                device.active = False
                logger.info("[Notifications/web] Disabled gone subscription id=%s", device.id)
            else:
                logger.warning("[Notifications/web] Push failed id=%s: %s", device.id, e)
        except Exception as e:
            logger.warning("[Notifications/web] Push errored id=%s: %s", device.id, e)
    db.commit()


# ── Domain helpers ────────────────────────────────────────────────────────────
# Thin wrappers so callers don't repeat copy/data shapes. Keep messages
# short — push UIs truncate fast.

def notify_prediction_settled(
    user_id: int,
    won: bool,
    pnl: float,
    event_id: int,
    event_title: str,
) -> None:
    if won:
        title = "You won!"
        body  = f"+${pnl:.2f} on \u201c{event_title}\u201d"
    else:
        title = "Bet settled"
        body  = f"\u201c{event_title}\u201d resolved \u2014 better luck next time."
    send_to_user(
        user_id=user_id,
        title=title,
        body=body,
        data={"route": "/market-detail", "params": {"id": str(event_id)}},
        pref="settled",
    )


def notify_new_follower(target_user_id: int, follower_display_name: str, follower_id: int) -> None:
    send_to_user(
        user_id=target_user_id,
        title="New follower",
        body=f"{follower_display_name} started following you.",
        data={"route": "/user-profile", "params": {"id": str(follower_id)}},
        pref="followers",
    )


def notify_market_closing_soon(user_id: int, event_id: int, event_title: str, minutes: int) -> None:
    send_to_user(
        user_id=user_id,
        title="Closing soon",
        body=f"\u201c{event_title}\u201d closes in {minutes} min.",
        data={"route": "/market-detail", "params": {"id": str(event_id)}},
        pref="closing",
    )
