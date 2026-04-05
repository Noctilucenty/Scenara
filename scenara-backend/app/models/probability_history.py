from sqlalchemy import Float, ForeignKey, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db import Base


class ScenarioProbabilityHistory(Base):
    __tablename__ = "scenario_probability_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("scenarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    probability: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    # What triggered this snapshot
    # "created" | "updated" | "resolved"
    source: Mapped[str] = mapped_column(
        String(32),
        default="updated",
        nullable=False,
    )

    recorded_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )

    scenario = relationship("Scenario", back_populates="probability_history")
    event = relationship("Event", back_populates="probability_history")