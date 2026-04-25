"""
app/routers/notifications.py

Two responsibilities:
  1. Device-token CRUD: the client registers/unregisters its push token
     here (POST /notifications/register, DELETE /notifications/register).
  2. Per-user preferences: GET / PATCH /notifications/preferences toggles
     the four notify_* booleans on the user row.

Also exposes:
  - GET /notifications/vapid-public-key — the frontend reads this on web to
    seed PushManager.subscribe(). Returns 404 when unset (signal to the
    client that web push isn't configured for this environment).
  - POST /notifications/test — admin-only smoke test that pushes "Hello"
    to the calling user's own devices. Useful right after registration to
    verify the round trip.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models.device_token import DeviceToken
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.notifications import send_to_user

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterDeviceIn(BaseModel):
    platform: Literal["expo", "web"]
    # For expo:  ExponentPushToken[xxx]
    # For web:   JSON-serialized PushSubscription
    token: str = Field(..., min_length=10, max_length=2048)


class RegisterDeviceOut(BaseModel):
    ok: bool
    device_id: int
    active: bool


class UnregisterIn(BaseModel):
    token: str


class PreferencesOut(BaseModel):
    notify_settled: bool
    notify_followers: bool
    notify_closing: bool
    notify_weekly_recap: bool


class PreferencesPatch(BaseModel):
    notify_settled: bool | None = None
    notify_followers: bool | None = None
    notify_closing: bool | None = None
    notify_weekly_recap: bool | None = None


class VapidKeyOut(BaseModel):
    public_key: str


# ── Device registration ───────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterDeviceOut)
def register_device(
    body: RegisterDeviceIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Idempotent UPSERT on (token).

    The token is globally unique. If it already exists for a different user
    (someone signed in on a shared device), we re-bind it to the new user.
    Active is reset to True so a previously-disabled token comes back online
    once the user explicitly re-registers.
    """
    existing = db.query(DeviceToken).filter(DeviceToken.token == body.token).first()
    now = datetime.utcnow()
    if existing:
        existing.user_id = current_user.id
        existing.platform = body.platform
        existing.active = True
        existing.last_seen_at = now
        db.commit()
        return RegisterDeviceOut(ok=True, device_id=existing.id, active=existing.active)

    device = DeviceToken(
        user_id=current_user.id,
        platform=body.platform,
        token=body.token,
        active=True,
        created_at=now,
        last_seen_at=now,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return RegisterDeviceOut(ok=True, device_id=device.id, active=device.active)


@router.delete("/register", status_code=status.HTTP_204_NO_CONTENT)
def unregister_device(
    body: UnregisterIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-disable. We keep the row for audit (when, which platform)."""
    db.query(DeviceToken).filter(
        DeviceToken.token == body.token,
        DeviceToken.user_id == current_user.id,
    ).update({"active": False}, synchronize_session=False)
    db.commit()
    return None


# ── Preferences ───────────────────────────────────────────────────────────────

@router.get("/preferences", response_model=PreferencesOut)
def get_preferences(current_user: User = Depends(get_current_user)):
    return PreferencesOut(
        notify_settled=bool(current_user.notify_settled),
        notify_followers=bool(current_user.notify_followers),
        notify_closing=bool(current_user.notify_closing),
        notify_weekly_recap=bool(current_user.notify_weekly_recap),
    )


@router.patch("/preferences", response_model=PreferencesOut)
def update_preferences(
    body: PreferencesPatch,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Only patch fields the client actually sent (None means "leave as-is").
    if body.notify_settled       is not None: current_user.notify_settled       = body.notify_settled
    if body.notify_followers     is not None: current_user.notify_followers     = body.notify_followers
    if body.notify_closing       is not None: current_user.notify_closing       = body.notify_closing
    if body.notify_weekly_recap  is not None: current_user.notify_weekly_recap  = body.notify_weekly_recap
    db.commit()
    return PreferencesOut(
        notify_settled=bool(current_user.notify_settled),
        notify_followers=bool(current_user.notify_followers),
        notify_closing=bool(current_user.notify_closing),
        notify_weekly_recap=bool(current_user.notify_weekly_recap),
    )


# ── Web push: VAPID public key ────────────────────────────────────────────────

@router.get("/vapid-public-key", response_model=VapidKeyOut)
def get_vapid_public_key():
    """The frontend uses this to seed PushManager.subscribe on web. We do
    NOT include the private key — that stays on the server forever."""
    if not settings.vapid_public_key:
        raise HTTPException(status_code=404, detail="Web push not configured")
    return VapidKeyOut(public_key=settings.vapid_public_key)


# ── Smoke test ────────────────────────────────────────────────────────────────

@router.post("/test")
def test_notification(current_user: User = Depends(get_current_user)):
    """Send a test push to all of the calling user's active devices."""
    send_to_user(
        user_id=current_user.id,
        title="Scenara test \u2728",
        body="Push notifications are working. You\u2019ll see settlements, follows, and closing-soon pings here.",
        data={"route": "/", "params": {}},
        pref=None,  # bypass prefs — this is opt-in by definition
    )
    return {"ok": True}
