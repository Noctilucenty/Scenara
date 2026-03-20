from sqlalchemy import String, Float, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db import Base


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("scenarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    simulated_amount: Mapped[float] = mapped_column(
        Numeric(18, 2),
        nullable=False,
    )

    entry_probability: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(32),
        default="open",
        nullable=False,
    )

    payout_multiplier: Mapped[float] = mapped_column(
        Float,
        default=1.0,
        nullable=False,
    )

    pnl: Mapped[float | None] = mapped_column(
        Numeric(18, 2),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    settled_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    user = relationship("User", back_populates="predictions")
    scenario = relationship("Scenario", back_populates="predictions")