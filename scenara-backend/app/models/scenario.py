from sqlalchemy import String, Text, Float, ForeignKey, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db import Base


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)

    title_pt: Mapped[str | None] = mapped_column(String(255), nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    probability: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    status: Mapped[str] = mapped_column(
        String(32), default="active", nullable=False
    )  # active / won / lost / void

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    event = relationship("Event", back_populates="scenarios")

    predictions = relationship(
        "Prediction",
        back_populates="scenario",
        cascade="all, delete-orphan",
    )

    probability_history = relationship(
        "ScenarioProbabilityHistory",
        back_populates="scenario",
        cascade="all, delete-orphan",
        order_by="ScenarioProbabilityHistory.recorded_at",
    )