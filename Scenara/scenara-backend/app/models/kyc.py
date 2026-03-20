# app/models/kyc.py
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class KycStatus(Base):
    __tablename__ = "kyc_status"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # One KYC row per user
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
    )

    # External user id used by Sumsub ("user-<id>")
    # Your SQLite DB currently expects this NOT NULL (based on your error).
    external_user_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        index=True,
    )

    # Sumsub applicant id is unique
    sumsub_applicant_id: Mapped[str | None] = mapped_column(
        String(128),
        unique=True,
        index=True,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(String(64), default="created")  # created/pending/approved/rejected/already_exists
    review_result: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship("User", backref="kyc_statuses")
