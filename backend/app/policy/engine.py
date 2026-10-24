"""Policy decisions (R1, R2, R3, R5, R7, PD, INTENT). Two engines, one rule set:

- LocalPolicy: the Python mirror of policy/sudibran.rego, evaluated in-process.
- OpaPolicy:   asks the OPA sidecar. Any error or timeout denies (R6, fail closed).

Engines return only {decision, rule}. explain() turns that into the sentence Maya and the
audit log see, so both engines produce identical reasons."""

import time
from pathlib import Path

import httpx

from app.config import ROOT, get_settings
from app.util import sha256_hex, usd

POLICY_DIR = ROOT / "policy"


def policy_digest() -> str:
    """sha256 over every .rego file (tests excluded). Written into each audit row so a
    reviewer can prove which policy version made a decision."""
    files = sorted(p for p in POLICY_DIR.glob("*.rego") if not p.name.endswith("_test.rego"))
    blob = "\n".join(f"{p.name}\n{Path(p).read_text(encoding='utf-8')}" for p in files)
    return sha256_hex(blob)


class LocalPolicy:
    name = "local"

    async def decide(self, inp: dict) -> dict:
        return evaluate(inp)


class OpaPolicy:
    name = "opa"

    def __init__(self, url: str):
        self.url = url.rstrip("/")

    async def decide(self, inp: dict) -> dict:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.post(f"{self.url}/v1/data/sudibran/decision", json={"input": inp})
                r.raise_for_status()
                result = r.json().get("result")
                if not isinstance(result, dict) or result.get("decision") not in {"allow", "ask", "deny"}:
                    raise ValueError(f"unexpected OPA result: {result!r}")
                return {"decision": result["decision"], "rule": result.get("rule")}
        except Exception as e:  # R6: an unevaluated policy is not a satisfied policy
            return {"decision": "deny", "rule": "R6", "error": str(e)}


def evaluate(inp: dict) -> dict:
    """Line-for-line mirror of `evaluate` in policy/sudibran.rego. Keep them in sync."""
    action = inp.get("action") or {}
    intent = inp.get("intent") or {}
    context = inp.get("context") or {}
    supplier = inp.get("supplier")
    off = set(inp.get("checks_off") or [])
    kind = action.get("type")
    pay = kind == "pay"
    payee = action.get("payee_account")

    supplier_missing = pay and (supplier is None or supplier.get("status") != "active")
    payee_off_record = (
        pay and supplier is not None and payee is not None and payee != supplier.get("account_masked")
        and "policy_r2" not in off
    )
    crs_flagged = pay and context.get("crs") == "flagged" and "crs_r7" not in off
    private_leak = (
        kind == "send_message" and action.get("contains_private") is True
        and action.get("recipient_internal") is not True and "policy_pd" not in off
    )

    if kind not in {"pay", "send_message", "remember"}:
        return {"decision": "ask", "rule": "INTENT"}
    if kind == "remember":
        return {"decision": "allow", "rule": None}
    if private_leak:
        return {"decision": "deny", "rule": "PD"}
    if kind == "send_message" and action.get("contains_private") is not True:
        return {"decision": "ask", "rule": "INTENT"}
    if kind == "send_message":
        return {"decision": "allow", "rule": None}
    if supplier_missing:
        return {"decision": "deny", "rule": "R2"}
    if payee_off_record:
        return {"decision": "deny", "rule": "R2"}
    if crs_flagged:
        return {"decision": "deny", "rule": "R7"}
    if "pay_suppliers_on_file" not in (intent.get("permissions") or []):
        return {"decision": "ask", "rule": "INTENT"}
    if action.get("origin") == "injection":
        return {"decision": "ask", "rule": "R5"}
    if action.get("claims_approval") is True:
        return {"decision": "ask", "rule": "R5"}
    if (action.get("amount_usd") or 0) > (intent.get("threshold_usd") or 0):
        return {"decision": "ask", "rule": "R1"}
    if context.get("report_status") in {"unverified", "mismatch"} and "gate_r3" not in off:
        return {"decision": "ask", "rule": "R3"}
    return {"decision": "allow", "rule": None}


def short_usd(n: float) -> str:
    return usd(n).replace(".00", "")


SOURCE_LABEL = {
    "invoice_text": "invoice text",
    "pdf_text": "PDF text",
    "memory": "memory, not the record",
    "message": "a message",
    "pasted": "pasted text",
}


def explain(result: dict, inp: dict) -> str:
    """The reason written to the audit log and shown to Maya."""
    action = inp.get("action") or {}
    intent = inp.get("intent") or {}
    supplier = inp.get("supplier")
    rule = result.get("rule")
    decision = result.get("decision")
    amount = action.get("amount_usd") or 0
    threshold = intent.get("threshold_usd") or 0
    payee = action.get("payee_account")
    name = (supplier or {}).get("name") or action.get("supplier_name") or "this supplier"
    short = name.split(" ")[0]

    if rule == "R6":
        return "Policy couldn't be evaluated, so the action is denied (R6: fail closed)"
    if rule == "INTENT":
        return "No policy covers this action and it isn't in Maya's intent, so it's held for review"
    if rule == "PD":
        return "Private data can't go to an outside destination"
    if rule == "R2" and (supplier is None or supplier.get("status") != "active"):
        return f"R2: {name} isn't an enrolled supplier, so there's no record to pay"
    if rule == "R2":
        source = SOURCE_LABEL.get(action.get("payee_source") or "", "untrusted text")
        return f"R2: {payee} is not on {short}'s supplier record (came from {source})"
    if rule == "R7":
        return f"R7: CRS fraud flag on the holder of {payee or (supplier or {}).get('account_masked')}"
    if rule == "R5" and action.get("claims_approval"):
        return "R5: an approval claimed in a message doesn't count; only Maya's own approval card does"
    if rule == "R5":
        return "R5: the instruction came from untrusted text, so Maya must approve"
    if rule == "R1":
        return f"R1: {short_usd(amount)} is above Maya's {short_usd(threshold)} threshold, so she decides"
    if rule == "R3":
        return "R3: the invoice came from an unverified message, so Maya decides"
    if decision == "allow" and action.get("type") == "remember":
        return "Memory write allowed; the entry keeps its source label"
    if decision == "allow" and action.get("type") == "send_message":
        return "Private-data check is off; the supplier DB is the next layer"
    if decision == "allow":
        acct = (supplier or {}).get("account_masked")
        return f"R2: payee from supplier record {acct} · R1: {short_usd(amount)} is under the {short_usd(threshold)} threshold"
    return f"{decision}: {rule}"


_engine = None


def engine():
    global _engine
    if _engine is None:
        s = get_settings()
        _engine = OpaPolicy(s.opa_url) if s.policy_engine == "opa" else LocalPolicy()
    return _engine


async def decide(inp: dict) -> dict:
    """Decision + rule + reason + digest + how long it took (for the p95 metric)."""
    start = time.perf_counter()
    result = await engine().decide(inp)
    ms = (time.perf_counter() - start) * 1000
    return {**result, "reason": explain(result, inp), "policy_digest": policy_digest(), "ms": ms}
