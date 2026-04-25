"""
Device push-notification tokens.

One row per (user, platform, token). A user can have many devices — phone,
tablet, laptop web push. The token itself is globally unique (enforced by
the index), so re-registering the same device is an idempotent UPSERT:
we look up by token, update user_id + last_seen_at, done.

Platforms we support:
  - "expo":   Native iOS/Android via Expo Push API. Tokens look like
              `ExponentPushToken[xxx]`.
  - "web":    W3C Web Push. Tokens are JSON blobs of the PushSubscription
              `{ endpoint, keys: { p256dh, auth } }`. We store them serialized
              as strings — same column as Expo tokens to keep the table flat.

Active-flag:
  A user can disable a device without deleting it (pref toggle). An inactive
  token is never sent to. If we get a 410 Gone / DeviceNotRegistered from the
  push service we set active=false rather than deleting — useful for audit.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DeviceToken(Base):
    __tablename__ = "device_tokens"
    __table_args__ = (
        # Token is globally unique — one device, one token. Re-registration
        # looks up by token and overwrites user_id (handles the case where a
        # user signs out and a new user signs in on the same device).
        Index("ix_device_tokens_token", "token", unique=True),
        Index("ix_device_tokens_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    # "expo" | "web"
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    # For "expo": ExponentPushToken[xxx]. For "web": JSON-serialized
    # PushSubscription object.
    token: Mapped[str] = mapped_column(String(2048), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False,
    )
