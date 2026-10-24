"""Tables and sessions. Portable across SQLite (dev, tests) and Postgres (compose).
On Postgres the audit table is append-only, enforced by a trigger, not by habit."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import JSON, Boolean, Float, Integer, String, Text, delete, event, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import get_settings


class Base(DeclarativeBase):
    pass


class KV(Base):
    """Single-value state: switches, balances, score, run counter, seller strikes."""

    __tablename__ = "kv"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | int | float | str | None] = mapped_column(JSON)


class IntentRow(Base):
    __tablename__ = "intents"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(Text)
    threshold_usd: Mapped[float] = mapped_column(Float)
    permissions: Mapped[list] = mapped_column(JSON)
    signed: Mapped[bool] = mapped_column(Boolean)
    signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32))


class SupplierRow(Base):
    __tablename__ = "suppliers"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    account_masked: Mapped[str] = mapped_column(String(16))
    # Lookup key only. Untrusted input is compared against this, never paid to.
    account_sha256: Mapped[str] = mapped_column(String(64), index=True)
    holder: Mapped[str | None] = mapped_column(String(120), nullable=True)
    nessie_account_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    crs: Mapped[str] = mapped_column(String(16))
    crs_subject: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active")  # active | pending_attestation | refused
    attested_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # the supplier's own AI agent


class AgentKey(Base):
    """Signing secret per registered seller agent (R3 action reports are HMAC-signed with it).
    Agents without a row here fall back to SELLER_AGENT_SECRET (the seeded Acme agent)."""

    __tablename__ = "agent_keys"
    agent_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    supplier_id: Mapped[str] = mapped_column(String(64))
    secret: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[str] = mapped_column(String(32))


class ComponentRow(Base):
    __tablename__ = "components"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), unique=True)
    type: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    fingerprint: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))


class InvoiceRow(Base):
    __tablename__ = "invoices"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(32))
    supplier: Mapped[str] = mapped_column(String(120))
    amount_usd: Mapped[float] = mapped_column(Float)
    source_agent: Mapped[str] = mapped_column(String(64))
    report_status: Mapped[str] = mapped_column(String(16))
    run_id: Mapped[str] = mapped_column(String(64))


class PaymentRow(Base):
    __tablename__ = "payments"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(32), unique=True)
    supplier: Mapped[str] = mapped_column(String(120))
    supplier_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    amount_usd: Mapped[float] = mapped_column(Float)
    account_masked: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(Text)
    crs: Mapped[str] = mapped_column(String(16))
    run_id: Mapped[str] = mapped_column(String(64))
    rail: Mapped[str | None] = mapped_column(String(16), nullable=True)  # nessie | simulated
    transfer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ApprovalRow(Base):
    __tablename__ = "approvals"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(32), unique=True)
    payment_id: Mapped[str] = mapped_column(String(32))
    run_id: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(Text)
    amount_usd: Mapped[float] = mapped_column(Float)
    supplier: Mapped[str] = mapped_column(String(120))
    account_masked: Mapped[str] = mapped_column(String(16))
    crs: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))


class ChatRow(Base):
    __tablename__ = "chat"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64))
    sender: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    untrusted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    time: Mapped[str] = mapped_column(String(32))


class RunRow(Base):
    __tablename__ = "runs"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(64), unique=True)
    data: Mapped[dict] = mapped_column(JSON)


class AuditRow(Base):
    """R8: one row per check. Columns mirror AuditEvent, plus the policy digest."""

    __tablename__ = "audit"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    time: Mapped[str] = mapped_column(String(32))
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    step: Mapped[int] = mapped_column(Integer)
    layer: Mapped[str] = mapped_column(String(24))
    mechanism: Mapped[str] = mapped_column(String(32))
    node: Mapped[str] = mapped_column(String(24))
    edge: Mapped[list] = mapped_column(JSON)
    decision: Mapped[str] = mapped_column(String(8))
    reason: Mapped[str] = mapped_column(Text)
    rule: Mapped[str | None] = mapped_column(String(16), nullable=True)
    off: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    actor: Mapped[str] = mapped_column(String(64))
    labels: Mapped[list] = mapped_column(JSON)
    payment_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
    policy_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)


class MemoryRow(Base):
    """Agent memory. Every entry keeps the trust label of where it came from."""

    __tablename__ = "memory"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(120))
    value: Mapped[str] = mapped_column(Text)
    trust: Mapped[str] = mapped_column(String(24))
    source: Mapped[str] = mapped_column(String(120))
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    time: Mapped[str] = mapped_column(String(32))


class CrsCheckRow(Base):
    __tablename__ = "crs_checks"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    subject: Mapped[str] = mapped_column(String(120))
    account_masked: Mapped[str] = mapped_column(String(16))
    result: Mapped[str] = mapped_column(String(16))
    source: Mapped[str] = mapped_column(String(16))  # live | simulated
    detail: Mapped[dict] = mapped_column(JSON)
    time: Mapped[str] = mapped_column(String(32))


class TokenNonce(Base):
    """Burned one-time capability tokens."""

    __tablename__ = "token_nonces"
    nonce: Mapped[str] = mapped_column(String(64), primary_key=True)
    used_at: Mapped[str] = mapped_column(String(32))


class ToolPin(Base):
    """Fingerprints of the MCP tools the agent can call (A6 rug-pull defence)."""

    __tablename__ = "tool_pins"
    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    description: Mapped[str] = mapped_column(Text)
    pinned_fingerprint: Mapped[str] = mapped_column(String(64))
    current_fingerprint: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))  # verified | quarantined
    reviewer: Mapped[str] = mapped_column(String(64))
    pinned_at: Mapped[str] = mapped_column(String(32))


class LatencySample(Base):
    __tablename__ = "latency"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(32))
    ms: Mapped[float] = mapped_column(Float)


# Cleared by Reset. Order matters only for readability.
RESET_TABLES = [
    KV, IntentRow, SupplierRow, ComponentRow, InvoiceRow, PaymentRow, ApprovalRow, ChatRow, RunRow, AuditRow,
    MemoryRow, CrsCheckRow, TokenNonce, ToolPin, LatencySample, AgentKey,
]

_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def engine():
    global _engine, _sessionmaker
    if _engine is None:
        url = get_settings().database_url
        _engine = create_async_engine(url, future=True)
        if _engine.dialect.name == "sqlite":
            # WAL lets the broker burn a token while the gate holds a read snapshot.
            event.listen(_engine.sync_engine, "connect", _sqlite_pragmas)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def _sqlite_pragmas(dbapi_conn, _record) -> None:
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=10000")
    cur.close()


@asynccontextmanager
async def session() -> AsyncIterator[AsyncSession]:
    engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as s:
        yield s


def is_postgres() -> bool:
    return engine().dialect.name == "postgresql"


APPEND_ONLY_SQL = [
    """
    CREATE OR REPLACE FUNCTION sudibran_audit_append_only() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit is append-only';
    END;
    $$ LANGUAGE plpgsql
    """,
    "DROP TRIGGER IF EXISTS audit_append_only ON audit",
    """
    CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit
    FOR EACH ROW EXECUTE FUNCTION sudibran_audit_append_only()
    """,
]


def _add_missing_columns(sync_conn) -> None:
    """create_all doesn't alter existing tables. Add any new nullable column, so a database
    created by an older version keeps working without a reset."""
    insp = inspect(sync_conn)
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name not in existing and col.nullable:
                ddl = col.type.compile(dialect=sync_conn.dialect)
                sync_conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {col.name} {ddl}'))


async def create_all() -> None:
    async with engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)
        if is_postgres():
            for stmt in APPEND_ONLY_SQL:
                await conn.execute(text(stmt))


async def wipe(s: AsyncSession) -> None:
    """Reset only. On Postgres, TRUNCATE skips the row-level append-only trigger on purpose:
    a demo reset is an operator action, not an agent action."""
    if is_postgres():
        names = ", ".join(t.__tablename__ for t in RESET_TABLES)
        await s.execute(text(f"TRUNCATE {names} RESTART IDENTITY"))
    else:
        for table in RESET_TABLES:
            await s.execute(delete(table))


async def dispose() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
