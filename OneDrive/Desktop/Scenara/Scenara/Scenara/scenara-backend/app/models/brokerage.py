from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # -----------------------------
    # SIMULATION WALLET (CORE NOW)
    # -----------------------------

    currency: Mapped[str] = mapped_column(
        String(10),
        default="USD",
        nullable=False,
    )

    balance: Mapped[Decimal] = mapped_column(
        Numeric(18, 2),
        default=10000,  # default play money
        nullable=False,
    )

    account_type: Mapped[str] = mapped_column(
        String(32),
        default="simulation",
        nullable=False,
    )
    # simulation / watch / future-live

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    # -----------------------------
    # RELATIONSHIPS
    # -----------------------------

    user = relationship("User", back_populates="simulation_accounts")

    transactions = relationship(
        "Transaction",
        back_populates="account",
        cascade="all, delete-orphan",
    )

    # -----------------------------
    # OLD FIELDS (KEEP COMMENTED if exist)
    # -----------------------------

    # external_account_id = ...
    # provider = ...
    # broker_reference = ...