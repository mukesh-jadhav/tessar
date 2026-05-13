"""SQLAlchemy mirror of the Prisma schema.

DO NOT add columns or tables here without first updating
``apps/web/prisma/schema.prisma`` and producing a migration. The
schema-drift check will fail PRs that do.

Naming rules:

* Table names match the Prisma ``@@map`` names (snake_case).
* Column names match Prisma ``@map`` (snake_case in Postgres, camelCase in
  TypeScript). Where Prisma left the default (Auth.js tables), we keep the
  Auth.js mixed-case spelling because the adapter requires it.
"""

from __future__ import annotations

import enum
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Shared declarative base. Metadata is the drift-check anchor."""


# ---------------------------------------------------------------------------
# Enums (must match Prisma's `@@map` strings exactly).
# ---------------------------------------------------------------------------


class RunStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    awaiting_clarification = "awaiting_clarification"
    succeeded = "succeeded"
    failed = "failed"
    refunded = "refunded"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class ArtifactKind(str, enum.Enum):
    package_json = "package_json"
    package_md = "package_md"
    package_pdf = "package_pdf"
    diagram_svg = "diagram_svg"
    diagram_png = "diagram_png"
    prompt_log = "prompt_log"
    source_snapshot = "source_snapshot"


# ---------------------------------------------------------------------------
# Auth tables — read-only from the worker.
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    image: Mapped[str | None] = mapped_column(String, nullable=True)
    email_verified: Mapped[datetime | None] = mapped_column(
        "emailVerified", DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), nullable=False
    )


# ---------------------------------------------------------------------------
# Run lifecycle.
# ---------------------------------------------------------------------------


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="run_status", native_enum=True), nullable=False
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status", native_enum=True),
        nullable=False,
    )
    brief_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    constraints_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    stripe_checkout_session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    stripe_payment_intent: Mapped[str | None] = mapped_column(String, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    kb_snapshot_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    events: Mapped[list[RunEvent]] = relationship(back_populates="run")
    artifacts: Mapped[list[RunArtifact]] = relationship(back_populates="run")

    __table_args__ = (
        Index("runs_user_id_created_at_idx", "user_id", "created_at"),
        Index("runs_status_idx", "status"),
        Index("runs_payment_status_idx", "payment_status"),
        UniqueConstraint(
            "stripe_checkout_session_id",
            name="runs_stripe_checkout_session_id_key",
        ),
    )


class RunEvent(Base):
    """Worker writes here. Hot path is Redis Streams; this is the durable copy."""

    __tablename__ = "run_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(
        String, ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False)

    run: Mapped[Run] = relationship(back_populates="events")

    __table_args__ = (Index("run_events_run_id_ts_idx", "run_id", "ts"),)


class RunArtifact(Base):
    """Worker writes here when the packager finishes."""

    __tablename__ = "run_artifacts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String, ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[ArtifactKind] = mapped_column(
        Enum(ArtifactKind, name="artifact_kind", native_enum=True), nullable=False
    )
    gcs_uri: Mapped[str] = mapped_column(String, nullable=False)
    mime: Mapped[str] = mapped_column(String, nullable=False)
    bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    run: Mapped[Run] = relationship(back_populates="artifacts")

    __table_args__ = (Index("run_artifacts_run_id_idx", "run_id"),)


# ---------------------------------------------------------------------------
# Knowledge base — read-only from the worker (loader is a separate one-shot).
# ---------------------------------------------------------------------------


class KbComponent(Base):
    __tablename__ = "kb_components"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    vendor: Mapped[str] = mapped_column(String, nullable=False)
    cloud: Mapped[str] = mapped_column(String, nullable=False)
    pricing_model: Mapped[str | None] = mapped_column(String, nullable=True)
    # Prisma `String[]` scalar lists are nullable at the DB level; Prisma
    # defaults them to `[]` at the application boundary. Mirror that here
    # so the drift check doesn't false-positive.
    regions: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    compliance: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    limits_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    sources: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    last_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)

    __table_args__ = (
        UniqueConstraint("cloud", "vendor", "name", name="kb_components_cloud_vendor_name_key"),
        Index("kb_components_category_idx", "category"),
        Index("kb_components_cloud_idx", "cloud"),
        Index("kb_components_last_verified_at_idx", "last_verified_at"),
    )


class KbPattern(Base):
    __tablename__ = "kb_patterns"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    when_to_use: Mapped[str] = mapped_column(Text, nullable=False)
    when_not_to_use: Mapped[str] = mapped_column(Text, nullable=False)
    # See KbComponent.regions for why this is nullable in the DB.
    examples: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    last_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)


class KbReferenceArch(Base):
    __tablename__ = "kb_reference_archs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    domain: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    components_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    last_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)

    __table_args__ = (Index("kb_reference_archs_domain_idx", "domain"),)
