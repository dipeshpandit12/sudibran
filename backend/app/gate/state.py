"""Gate state: reads and writes behind every /api route. One asyncio lock serialises every
change, so the audit chain stays strictly ordered."""

import asyncio
import json
import re
import time

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import catalog
from app.agents.tools import TOOL_SPECS, tool_fingerprint
from app.audit.chain import GENESIS, event_hash, verify
from app.config import ROOT
from app.db import (
    KV,
    ApprovalRow,
    AuditRow,
    ChatRow,
    ComponentRow,
    IntentRow,
    InvoiceRow,
    PaymentRow,
    RunRow,
    SupplierRow,
    ToolPin,
    wipe,
)
from app.gate import events as bus
from app.security import keys
from app.util import now, sha256_hex, usd

lock = asyncio.Lock()

DEFAULT_SWITCHES = {"assume_breach": True, "layer_off": None, "audit_down": False}


# ───────────── key/value state ─────────────


async def kv_get(s: AsyncSession, key: str, default=None):
    row = await s.get(KV, key)
    return default if row is None else row.value


async def kv_set(s: AsyncSession, key: str, value) -> None:
    row = await s.get(KV, key)
    if row is None:
        s.add(KV(key=key, value=value))
    else:
        row.value = value


async def switches(s: AsyncSession) -> dict:
    return dict(await kv_get(s, "switches", DEFAULT_SWITCHES))


async def balances(s: AsyncSession) -> dict:
    return dict(await kv_get(s, "balances", {"raw": 5000.0, "protected": 5000.0}))


async def score(s: AsyncSession) -> dict:
    return dict(await kv_get(s, "score", {"fired": 0, "harmed": 0, "blocked": 0}))


async def next_counter(s: AsyncSession) -> int:
    n = int(await kv_get(s, "counter", 0)) + 1
    await kv_set(s, "counter", n)
    return n


# ───────────── seed / reset ─────────────


def _registry() -> dict:
    return {k: v for k, v in json.loads((ROOT / "data" / "registry.json").read_text()).items() if not k.startswith("_")}


def _crs_subjects() -> dict:
    path = ROOT / "data" / "crs_identities.json"
    return json.loads(path.read_text()) if path.exists() else {}


async def seed_all(s: AsyncSession) -> None:
    seed = catalog.seed()
    intent = seed["intent"]
    s.add(IntentRow(**intent, signature=keys.sign(keys.intent_message(intent))))

    registry = _registry()
    subjects = _crs_subjects()
    for sup in seed["suppliers"]:
        rec = registry.get(sup["id"], {})
        account = rec.get("account_number", sup["account_masked"])
        s.add(SupplierRow(
            id=sup["id"], name=sup["name"], account_masked=sup["account_masked"], account_sha256=sha256_hex(account),
            holder=rec.get("holder"), crs=sup["crs"], crs_subject=(subjects.get(sup["account_masked"]) or {}).get("subject"),
            status="active", attested_by="maya",
        ))
    for comp in seed["components"]:
        s.add(ComponentRow(**comp))
    for msg in seed["chat"]:
        s.add(ChatRow(id=msg["id"], sender=msg["from"], text=msg["text"], untrusted=msg.get("untrusted"), time=msg["time"]))
    for spec in TOOL_SPECS:
        fp = tool_fingerprint(spec)
        s.add(ToolPin(name=spec["name"], description=spec["description"], pinned_fingerprint=fp, current_fingerprint=fp,
                      status="verified", reviewer="maya", pinned_at=now()))
    await kv_set(s, "balances", dict(seed["balances"]))
    await kv_set(s, "switches", dict(DEFAULT_SWITCHES))
    await kv_set(s, "score", {"fired": 0, "harmed": 0, "blocked": 0})
    await kv_set(s, "counter", 0)
    await kv_set(s, "seller_strikes", 0)


async def ensure_seeded(s: AsyncSession) -> None:
    if (await s.execute(select(func.count()).select_from(IntentRow))).scalar_one() == 0:
        await seed_all(s)
        await s.commit()


async def reset(s: AsyncSession) -> None:
    await wipe(s)
    await seed_all(s)
    await s.commit()


# ───────────── reads ─────────────


async def current_intent_row(s: AsyncSession) -> IntentRow:
    return (await s.execute(select(IntentRow).order_by(IntentRow.seq.desc()).limit(1))).scalar_one()


def intent_dict(row: IntentRow) -> dict:
    return {
        "id": row.id, "text": row.text, "threshold_usd": row.threshold_usd, "permissions": list(row.permissions),
        "signed": row.signed, "created_at": row.created_at,
    }


async def intent(s: AsyncSession) -> dict:
    return intent_dict(await current_intent_row(s))


def supplier_dict(r: SupplierRow) -> dict:
    out = {"id": r.id, "name": r.name, "account_masked": r.account_masked, "crs": r.crs}
    if r.status != "active":
        out["status"] = r.status
    return out


async def suppliers(s: AsyncSession, include_pending: bool = False) -> list[dict]:
    rows = (await s.execute(select(SupplierRow).order_by(SupplierRow.seq))).scalars().all()
    return [supplier_dict(r) for r in rows if include_pending or r.status == "active"]


async def supplier_by_name(s: AsyncSession, name: str) -> SupplierRow | None:
    rows = (await s.execute(select(SupplierRow).order_by(SupplierRow.seq))).scalars().all()
    key = (name or "").lower().strip()
    for r in rows:
        if r.name.lower() == key or r.id == key:
            return r
    first = key.split(" ")[0] if key else ""
    return next((r for r in rows if first and r.name.lower().startswith(first)), None)


async def components(s: AsyncSession) -> list[dict]:
    rows = (await s.execute(select(ComponentRow).order_by(ComponentRow.seq))).scalars().all()
    return [{"id": r.id, "type": r.type, "name": r.name, "description": r.description,
             "fingerprint": r.fingerprint, "status": r.status} for r in rows]


def invoice_dict(r: InvoiceRow) -> dict:
    return {"id": r.id, "supplier": r.supplier, "amount_usd": r.amount_usd, "source_agent": r.source_agent,
            "report_status": r.report_status, "run_id": r.run_id}


def payment_dict(r: PaymentRow) -> dict:
    out = {"id": r.id, "supplier": r.supplier, "amount_usd": r.amount_usd, "account_masked": r.account_masked,
           "status": r.status, "reason": r.reason, "crs": r.crs, "run_id": r.run_id}
    if r.rail:
        out["rail"] = r.rail
    if r.transfer_id:
        out["transfer_id"] = r.transfer_id
    return out


def approval_dict(r: ApprovalRow) -> dict:
    return {"id": r.id, "payment_id": r.payment_id, "run_id": r.run_id, "reason": r.reason, "amount_usd": r.amount_usd,
            "supplier": r.supplier, "account_masked": r.account_masked, "crs": r.crs, "status": r.status}


def chat_dict(r: ChatRow) -> dict:
    out = {"id": r.id, "from": r.sender, "text": r.text, "time": r.time}
    if r.untrusted is not None:
        out["untrusted"] = r.untrusted
    return out


async def invoices(s: AsyncSession) -> list[dict]:
    rows = (await s.execute(select(InvoiceRow).order_by(InvoiceRow.seq.desc()))).scalars().all()
    return [invoice_dict(r) for r in rows]


async def payments(s: AsyncSession) -> list[dict]:
    rows = (await s.execute(select(PaymentRow).order_by(PaymentRow.seq.desc()))).scalars().all()
    return [payment_dict(r) for r in rows]


async def approvals(s: AsyncSession) -> list[dict]:
    rows = (await s.execute(select(ApprovalRow).order_by(ApprovalRow.seq.desc()))).scalars().all()
    return [approval_dict(r) for r in rows]


async def chat(s: AsyncSession) -> list[dict]:
    rows = (await s.execute(select(ChatRow).order_by(ChatRow.seq))).scalars().all()
    return [chat_dict(r) for r in rows]


async def runs(s: AsyncSession) -> list[dict]:
    rows = (await s.execute(select(RunRow).order_by(RunRow.seq))).scalars().all()
    return [r.data for r in rows]


async def run_row(s: AsyncSession, run_id: str) -> RunRow | None:
    return (await s.execute(select(RunRow).where(RunRow.run_id == run_id))).scalar_one_or_none()


def audit_dict(r: AuditRow) -> dict:
    out = {
        "node": r.node, "edge": list(r.edge), "layer": r.layer, "mechanism": r.mechanism, "decision": r.decision,
        "reason": r.reason, "seq": r.seq, "time": r.time, "run_id": r.run_id, "step": r.step, "actor": r.actor,
        "labels": list(r.labels), "payment_id": r.payment_id, "prev_hash": r.prev_hash, "hash": r.hash,
    }
    if r.rule is not None:
        out["rule"] = r.rule
    if r.off is not None:
        out["off"] = r.off
    if r.policy_digest:
        out["policy_digest"] = r.policy_digest
    return out


async def audit(s: AsyncSession, run_id: str | None = None, layer: str | None = None, after_seq: int = 0) -> list[dict]:
    q = select(AuditRow).where(AuditRow.seq > after_seq).order_by(AuditRow.seq)
    if run_id:
        q = q.where(AuditRow.run_id == run_id)
    if layer:
        q = q.where(AuditRow.layer == layer)
    return [audit_dict(r) for r in (await s.execute(q)).scalars().all()]


async def audit_length(s: AsyncSession) -> int:
    return (await s.execute(select(func.count()).select_from(AuditRow))).scalar_one()


async def verify_chain(s: AsyncSession) -> dict:
    return verify(await audit(s))


async def get_state(s: AsyncSession) -> dict:
    return {
        "intent": await intent(s),
        "suppliers": await suppliers(s),
        "components": await components(s),
        "balances": await balances(s),
        "invoices": await invoices(s),
        "payments": await payments(s),
        "approvals": await approvals(s),
        "chat": await chat(s),
        "switches": await switches(s),
        "score": await score(s),
        "runs": await runs(s),
        "audit_length": await audit_length(s),
    }


# ───────────── writes ─────────────


async def say(s: AsyncSession, sender: str, text: str, untrusted: bool = False) -> None:
    count = (await s.execute(select(func.count()).select_from(ChatRow))).scalar_one()
    s.add(ChatRow(id=f"m-{count + 1}-{int(time.time() * 1000)}", sender=sender, text=text, untrusted=untrusted,
                  time=now()))
    await s.flush()


def labels_for(e: dict) -> list[str]:
    """Port of labelsFor() in lib/store.ts: data labels derived from each check."""
    labels = []
    if re.search(r"untrusted|unverified|text|hidden|pasted", e["reason"], re.IGNORECASE) or e["layer"] in (
        "external_data", "other_agents"
    ):
        labels.append("untrusted")
    if e["layer"] == "private_data" or re.search(r"masked|supplier record|row-level", e["reason"], re.IGNORECASE):
        labels.append("private")
    if e["layer"] == "payment":
        labels.append("payment")
    if e["mechanism"] == "assume_breach":
        labels.append("assume_breach")
    return labels


async def append_audit(
    s: AsyncSession, run_id: str, events: list[dict], payment_id: str | None, policy_digest: str | None = None
) -> list[dict]:
    """R8: stamp each check with seq, time, actor, labels and the hash chain, then write it."""
    threshold = (await current_intent_row(s)).threshold_usd
    threshold_text = f"{usd(threshold).replace('.00', '')} threshold"
    last = (await s.execute(select(AuditRow).order_by(AuditRow.seq.desc()).limit(1))).scalar_one_or_none()
    prev_hash = last.hash if last else GENESIS
    seq = last.seq if last else 0
    stamped = []
    for i, e in enumerate(events):
        seq += 1
        base = {
            **{k: v for k, v in e.items() if k in ("node", "edge", "layer", "mechanism", "decision", "rule", "off")},
            "reason": e["reason"].replace("$500 threshold", threshold_text),
            "seq": seq,
            "time": now(),
            "run_id": run_id,
            "step": i + 1,
            "actor": catalog.ACTOR[e["node"]],
            "labels": labels_for(e),
            "payment_id": payment_id,
            "prev_hash": prev_hash,
        }
        if base.get("rule") is None:
            base.pop("rule", None)
        if not base.get("off"):
            base.pop("off", None)
        base["hash"] = event_hash(base)
        prev_hash = base["hash"]
        digest = e.get("policy_digest") or policy_digest
        s.add(AuditRow(
            seq=seq, time=base["time"], run_id=run_id, step=base["step"], layer=base["layer"],
            mechanism=base["mechanism"], node=base["node"], edge=base["edge"], decision=base["decision"],
            reason=base["reason"], rule=base.get("rule"), off=base.get("off"), actor=base["actor"],
            labels=base["labels"], payment_id=payment_id, prev_hash=base["prev_hash"], hash=base["hash"],
            policy_digest=digest,
        ))
        if digest:
            base["policy_digest"] = digest
        stamped.append(base)
    await s.flush()
    return stamped


def publish(events: list[dict]) -> None:
    bus.publish(events)
