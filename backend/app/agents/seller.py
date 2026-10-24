"""The supplier's agent (Acme's AI) and its action reports (R3).

A report is the other agent's own claim about what it did: which tools it used, which invoice
and amount it sent. A signed report counts as verified; a plain one as unverified; one that
contradicts what Sudibran actually received is a mismatch (blocked, strike recorded).
Reports can never authorise a payment, whatever they say.

scripts/seller_agent.py drives this agent against a running gate, in normal and attack modes."""

import hashlib
import hmac
import json

from app.config import get_settings


def _secret(secret: str | None) -> bytes:
    # Each agent registered at supplier attestation has its own secret (agent_keys table);
    # the seeded Acme agent uses SELLER_AGENT_SECRET.
    return (secret or get_settings().seller_agent_secret).encode()


def sign_report(agent_id: str, report: dict, secret: str | None = None) -> str:
    body = json.dumps(report, sort_keys=True, separators=(",", ":")).encode()
    return hmac.new(_secret(secret), body, hashlib.sha256).hexdigest()


def check_report(agent_id: str, report: dict | None, signature: str | None, fields: dict,
                 secret: str | None = None) -> tuple[str, str]:
    """Returns (status, reason) with status verified | unverified | mismatch."""
    if not report:
        return "unverified", "R3: no action report, so the message is marked unverified"
    claims_approval = any(k in report for k in ("approved_by", "approval", "pre_approved"))
    amount = report.get("amount_usd")
    invoice_id = report.get("invoice_id")
    if claims_approval:
        return "mismatch", "R3: report claims an approval that doesn't exist, so it's blocked"
    if amount is not None and abs(float(amount) - float(fields.get("amount_usd") or 0)) > 0.005:
        return "mismatch", f"R3: report says ${float(amount):,.2f} but the invoice says ${float(fields['amount_usd']):,.2f}"
    if invoice_id and fields.get("invoice_id") and invoice_id != fields["invoice_id"]:
        return "mismatch", f"R3: report names {invoice_id} but the invoice is {fields['invoice_id']}"
    if signature and hmac.compare_digest(signature, sign_report(agent_id, report, secret)):
        return "verified", f"{agent_id} verified · signed action report"
    return "unverified", "R3: the report isn't signed, so the message is marked unverified"
