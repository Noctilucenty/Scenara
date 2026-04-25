from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )

    display_name: Mapped[str] = mapped_column(
        String(100), nullable=False, default="",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )

    is_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="0",
    )

    current_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    best_streak: Mapped[int]    = mapped_column(Integer, default=0, nullable=False)

    # Total XP earned across the platform. Awarded on every prediction placed
    # (amount // 5). Never decreases. Drives the level badge (sqrt curve).
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")

    # ── Password reset OTP ──────────────────────────────────────────────────
    # SHA-256 hex digest of the 6-digit one-time code. Null when no reset is
    # pending. Overwritten each time the user requests a new code (old code
    # becomes invalid). Cleared to NULL after successful use.
    reset_code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    reset_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)

    # ── Notification preferences ────────────────────────────────────────────
    notify_settled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    notify_followers: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    notify_closing: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")
    notify_weekly_recap: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="1")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)

    simulation_accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    simulation_transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="user", cascade="all, delete-orphan")