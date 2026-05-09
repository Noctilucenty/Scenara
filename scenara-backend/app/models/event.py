from __future__ import annotations
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class Event(Base):
    __tablename__ = "events"

    id:               Mapped[int]             = mapped_column(primary_key=True, index=True)
    slug:             Mapped[str]             = mapped_column(String(150), unique=True, index=True, nullable=False)
    title:            Mapped[str]             = mapped_column(String(255), nullable=False)
    title_pt:         Mapped[str | None]      = mapped_column(String(255), nullable=True)
    title_zh:         Mapped[str | None]      = mapped_column(String(255), nullable=True)
    description:      Mapped[str | None]      = mapped_column(Text, nullable=True)
    description_pt:   Mapped[str | None]      = mapped_column(Text, nullable=True)
    description_zh:   Mapped[str | None]      = mapped_column(Text, nullable=True)
    category:         Mapped[str]             = mapped_column(String(50), default="general", nullable=False)
    source:           Mapped[str | None]      = mapped_column(String(255), nullable=True)
    status:           Mapped[str]             = mapped_column(String(20), default="open", nullable=False)
    resolution_note:  Mapped[str | None]      = mapped_column(Text, nullable=True)
    is_featured:      Mapped[bool]            = mapped_column(Boolean, default=False, nullable=False)
    closes_at:        Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at:      Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at:       Mapped[datetime]        = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at:       Mapped[datetime]        = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # AI auto-resolution state — persisted so it survives Render restarts.
    ai_attempt_count:    Mapped[int]             = mapped_column(Integer, default=0, nullable=False)
    last_ai_attempt_at:  Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ai_last_confidence:  Mapped[int | None]      = mapped_column(Integer, nullable=True)
    ai_last_note:        Mapped[str | None]      = mapped_column(Text, nullable=True)
    ai_source_url:       Mapped[str | None]      = mapped_column(String(500), nullable=True)
    ai_needs_review:     Mapped[bool]            = mapped_column(Boolean, default=False, nullable=False)

    # External market origin — Polymarket today, room for Kalshi/Manifold later.
    # When external_source is set, the snapshot loop refreshes probabilities
    # from the source's public API instead of running a random-walk model.
    external_source:    Mapped[str | None]      = mapped_column(String(40), nullable=True, index=True)
    external_id:        Mapped[str | None]      = mapped_column(String(120), nullable=True, index=True)
    external_url:       Mapped[str | None]      = mapped_column(String(500), nullable=True)
    external_volume:    Mapped[float | None]    = mapped_column(Float, nullable=True)
    external_liquidity: Mapped[float | None]    = mapped_column(Float, nullable=True)
    external_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    scenarios           = relationship("Scenario", back_populates="event", cascade="all, delete-orphan")
    probability_history = relationship("ScenarioProbabilityHistory", back_populates="event", cascade="all, delete-orphan")