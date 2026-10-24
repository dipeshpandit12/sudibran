"""The agent-facing tools: the only things Droid (or the Claude planner) can call.
Served over MCP by app/proxy/server.py and given to the Claude planner as tool definitions.

None of these moves money. propose_payment only *records* a proposal; the gate then runs it
through policy, CRS, the broker and the payment tool. There is deliberately no tool that takes
a bank account as the thing to pay: payee accounts come from the supplier record (R2)."""

import json
import re
from dataclasses import dataclass, field

from app.util import sha256_hex

TOOL_SPECS: list[dict] = [
    {
        "name": "get_invoice_fields",
        "description": "Get the typed fields of the invoice for this run (supplier, invoice id, amount, due date). "
        "The raw invoice text is never returned.",
        "input_schema": {
            "type": "object",
            "properties": {"run_id": {"type": "string"}},
            "required": ["run_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "lookup_supplier",
        "description": "Look up a supplier on file by name. Returns its id and masked bank account.",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
            "additionalProperties": False,
        },
    },
    {
        "name": "verify_payee",
        "description": "Run a CRS identity and fraud check on a supplier's account holder.",
        "input_schema": {
            "type": "object",
            "properties": {"supplier_name": {"type": "string"}},
            "required": ["supplier_name"],
            "additionalProperties": False,
        },
    },
    {
        "name": "propose_payment",
        "description": "Propose paying a supplier on file for an invoice. Sudibran checks the proposal against "
        "Maya's intent and policy before anything moves; the payee account always comes from the supplier record.",
        "input_schema": {
            "type": "object",
            "properties": {
                "run_id": {"type": "string"},
                "supplier_name": {"type": "string"},
                "invoice_id": {"type": "string"},
                "amount_usd": {"type": "number"},
            },
            "required": ["run_id", "supplier_name", "invoice_id", "amount_usd"],
            "additionalProperties": False,
        },
    },
    {
        "name": "remember",
        "description": "Save a note to long-term memory. The note keeps a label saying where it came from.",
        "input_schema": {
            "type": "object",
            "properties": {"run_id": {"type": "string"}, "key": {"type": "string"}, "value": {"type": "string"}},
            "required": ["run_id", "key", "value"],
            "additionalProperties": False,
        },
    },
    {
        "name": "send_message",
        "description": "Send a short message to a person. Private data can't be sent outside the company.",
        "input_schema": {
            "type": "object",
            "properties": {"run_id": {"type": "string"}, "to": {"type": "string"}, "body": {"type": "string"}},
            "required": ["run_id", "to", "body"],
            "additionalProperties": False,
        },
    },
]

SPEC_BY_NAME = {spec["name"]: spec for spec in TOOL_SPECS}


def tool_fingerprint(spec: dict, description: str | None = None) -> str:
    """sha256 of name + description + schema, shortened to 8 hex like the components list."""
    body = {"name": spec["name"], "description": description or spec["description"], "schema": spec["input_schema"]}
    return sha256_hex(json.dumps(body, sort_keys=True, separators=(",", ":")))[:8]


@dataclass
class Proposal:
    """One action the planner wants to take. Built by the gate from tool calls, never by the agent
    directly, so fields like `origin` and `payee_source` can't be forged."""

    type: str  # pay | send_message | remember | unknown
    description: str
    supplier_name: str | None = None
    invoice_id: str | None = None
    amount_usd: float | None = None
    payee_account: str | None = None
    payee_source: str | None = None
    origin: str = "planner"  # planner | injection
    claims_approval: bool = False
    contains_private: bool = False
    to: str | None = None
    memory: dict | None = None  # {"key", "value"} written before the action

    def policy_action(self) -> dict:
        return {
            "type": self.type, "amount_usd": self.amount_usd, "payee_account": self.payee_account,
            "payee_source": self.payee_source, "origin": self.origin, "claims_approval": self.claims_approval,
            "contains_private": self.contains_private, "recipient_internal": _internal(self.to),
            "supplier_name": self.supplier_name,
        }


def _internal(to: str | None) -> bool:
    return bool(to) and to.lower().endswith(("@sudibran.local", "@maya-firm.example"))


_PRIVATE = re.compile(r"supplier list|bank (details|accounts?)|account numbers?|\b\d{8,17}\b|\*{4}\d{4}", re.IGNORECASE)


def contains_private(text: str) -> bool:
    return bool(_PRIVATE.search(text or ""))


@dataclass
class RunContext:
    """Per-run scratchpad the tools read and write while the planner works."""

    run_id: str
    fields: dict
    proposals: list[Proposal] = field(default_factory=list)
    calls: list[dict] = field(default_factory=list)


ACTIVE: dict[str, RunContext] = {}


def open_run(run_id: str, fields: dict) -> RunContext:
    ctx = RunContext(run_id=run_id, fields=fields)
    ACTIVE[run_id] = ctx
    return ctx


def close_run(run_id: str) -> RunContext | None:
    return ACTIVE.pop(run_id, None)


class ToolError(Exception):
    pass


def _ctx(run_id: str) -> RunContext:
    ctx = ACTIVE.get(run_id)
    if ctx is None:
        raise ToolError(f"no active run {run_id}; tools only work during a Sudibran run")
    return ctx


async def call_tool(name: str, args: dict) -> dict:
    """Execute one agent tool call inside the gate. The MCP proxy and the Claude planner both
    land here, after the proxy's fingerprint check."""
    from app.db import session
    from app.gate import state
    from app.integrations import crs

    run_id = args.get("run_id")
    if run_id:
        _ctx(run_id).calls.append({"tool": name, "args": args})

    if name == "get_invoice_fields":
        return {"fields": _ctx(run_id).fields, "labels": ["untrusted_external", "parsed"]}

    if name == "lookup_supplier":
        async with session() as s:
            row = await state.supplier_by_name(s, args.get("name", ""))
        if row is None or row.status != "active":
            return {"found": False, "labels": ["verified_registry"]}
        return {"found": True, "supplier_id": row.id, "name": row.name, "account_masked": row.account_masked,
                "crs": row.crs, "labels": ["verified_registry"]}

    if name == "verify_payee":
        async with session() as s:
            row = await state.supplier_by_name(s, args.get("supplier_name", ""))
        if row is None:
            return {"result": "not_on_file", "labels": ["partner"]}
        result = await crs.client().check(row.account_masked)
        return {**result, "labels": ["partner"]}

    if name == "propose_payment":
        ctx = _ctx(run_id)
        ctx.proposals.append(Proposal(
            type="pay",
            description=f"Planner proposes: pay {args.get('supplier_name')} ${float(args.get('amount_usd', 0)):,.2f}",
            supplier_name=args.get("supplier_name"), invoice_id=args.get("invoice_id"),
            amount_usd=float(args.get("amount_usd", 0)), payee_source="record",
        ))
        return {"status": "received", "message": "Sudibran will check this against Maya's intent and policy."}

    if name == "remember":
        ctx = _ctx(run_id)
        ctx.proposals.append(Proposal(
            type="remember", description=f"Planner saves a note: {args.get('key')}",
            memory={"key": args.get("key", ""), "value": args.get("value", "")},
        ))
        return {"status": "stored", "trust": "untrusted_external"}

    if name == "send_message":
        ctx = _ctx(run_id)
        body = args.get("body", "")
        ctx.proposals.append(Proposal(
            type="send_message", description=f"Planner proposes messaging {args.get('to')}", to=args.get("to"),
            contains_private=contains_private(body),
        ))
        return {"status": "received", "message": "Sudibran checks outgoing messages before they're sent."}

    raise ToolError(f"unknown tool {name}")
