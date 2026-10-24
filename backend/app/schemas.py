"""Pydantic twins of frontend/lib/types.ts. Field names and shapes must not drift:
the frontend reads these directly. Extra fields are allowed so new backend-only fields
(mode, policy_digest, nessie_transfer_id, ...) pass through without breaking anything."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Decision = Literal["allow", "flag", "deny", "ask", "hold"]
Layer = Literal[
    "user_interface", "llm", "workflow", "memory", "other_agents", "tool", "external_data", "private_data", "payment"
]
NodeId = Literal[
    "maya", "gate", "seller", "planner", "parser", "memory", "policy", "broker", "crs", "nessie", "proxy",
    "invoice_reader", "supplier_db",
]
PaymentStatus = Literal["paid", "blocked", "awaiting_maya", "on_hold"]
CrsResult = Literal["clean", "flagged", "not_needed"]


class Model(BaseModel):
    model_config = ConfigDict(extra="allow")


class ScenarioEvent(Model):
    node: NodeId
    edge: list[NodeId]
    layer: Layer
    mechanism: str
    decision: Decision
    reason: str
    rule: str | None = None
    off: bool | None = None


class AuditEvent(ScenarioEvent):
    seq: int
    time: str
    run_id: str
    step: int
    actor: str
    labels: list[str]
    payment_id: str | None
    prev_hash: str
    hash: str


class Intent(Model):
    id: str
    text: str
    threshold_usd: float
    permissions: list[str]
    signed: bool
    created_at: str


class Component(Model):
    id: str
    type: Literal["mcp_tool", "model", "agent", "service"]
    name: str
    description: str
    fingerprint: str
    status: Literal["verified", "quarantined"]


class Supplier(Model):
    id: str
    name: str
    account_masked: str
    crs: Literal["clean", "flagged"]


class Invoice(Model):
    id: str
    supplier: str
    amount_usd: float
    source_agent: str
    report_status: Literal["verified", "unverified", "mismatch"]
    run_id: str


class Payment(Model):
    id: str
    supplier: str
    amount_usd: float
    account_masked: str
    status: PaymentStatus
    reason: str
    crs: CrsResult
    run_id: str


class Approval(Model):
    id: str
    payment_id: str
    run_id: str
    reason: str
    amount_usd: float
    supplier: str
    account_masked: str
    crs: CrsResult
    status: Literal["pending", "approved", "rejected"]


class ChatMessage(Model):
    id: str
    # "from" is a Python keyword; the alias keeps the JSON field name.
    from_: Literal["maya", "agent", "sudibran"] = Field(alias="from")
    text: str
    untrusted: bool | None = None
    time: str

    model_config = ConfigDict(extra="allow", populate_by_name=True, serialize_by_alias=True)


class Harm(Model):
    type: Literal["money", "data", "none"]
    amount_usd: float
    detail: str


class ProtectedResult(Model):
    payment_status: PaymentStatus | Literal["none"]
    balance_change_usd: float
    alert_maya: bool
    summary: str


class AttackInfo(Model):
    id: str
    short: str
    layer: Layer
    title: str
    description: str


class ScenarioInfo(Model):
    id: str
    kind: Literal["attack", "story"]
    layer: Layer
    title: str
    injection: str | None


class Check(Model):
    key: str
    label: str
    node: NodeId
    rule: str | None = None


class DemoSwitches(Model):
    assume_breach: bool
    layer_off: str | None
    audit_down: bool


class SwitchesPatch(BaseModel):
    assume_breach: bool | None = None
    layer_off: str | None = None
    audit_down: bool | None = None


class RawSide(Model):
    steps: list[str]
    harm: Harm
    balance_before: float
    balance_after: float


class ProtectedSide(Model):
    events: list[AuditEvent]
    caught_at: NodeId | None
    rule: str | None
    result: ProtectedResult
    balance_before: float
    balance_after: float
    approval_id: str | None
    via_layer_off: bool
    model_resisted: bool
    note: str | None


class InvoiceInfo(Model):
    id: str
    supplier: str
    amount_usd: float
    source_agent: str
    report_status: Literal["verified", "unverified", "mismatch"]


class RunResult(Model):
    run_id: str
    scenario_id: str
    kind: Literal["attack", "story"]
    title: str
    injection: str | None
    invoice: InvoiceInfo | None
    switches: DemoSwitches
    raw: RawSide
    protected: ProtectedSide


class Score(Model):
    fired: int
    harmed: int
    blocked: int


class Balances(Model):
    raw: float
    protected: float


class DemoState(Model):
    intent: Intent
    suppliers: list[Supplier]
    components: list[Component]
    balances: Balances
    invoices: list[Invoice]
    payments: list[Payment]
    approvals: list[Approval]
    chat: list[ChatMessage]
    switches: DemoSwitches
    score: Score
    runs: list[RunResult]
    audit_length: int


class ChainCheck(Model):
    intact: bool
    checked_events: int
    broken_at: int | None


class AgentMessage(Model):
    from_: str = Field(alias="from")
    text: str
    labels: list[str]

    model_config = ConfigDict(extra="allow", populate_by_name=True, serialize_by_alias=True)


class CrsSummary(Model):
    checked: bool
    result: str


class Outcome(ProtectedResult):
    caught_at: NodeId | None
    rule: str | None


class EvidenceReport(Model):
    run_id: str
    scenario_id: str
    title: str
    generated_at: str
    switches: DemoSwitches
    intent: Intent
    agent_messages: list[AgentMessage]
    tool_calls: list[AuditEvent]
    decisions: list[AuditEvent]
    approvals: list[Approval]
    crs: CrsSummary
    outcome: Outcome
    chain: ChainCheck


class DecisionOut(BaseModel):
    approval: Approval
    payment: Payment
    events: list[AuditEvent]


# ───────────── request bodies ─────────────


class IntentIn(BaseModel):
    text: str | None = None
    threshold_usd: float | None = None


class ChatIn(BaseModel):
    text: str | None = None
    pasted: bool | None = False


class ApprovalIn(BaseModel):
    action: str | None = None


class InjectIn(BaseModel):
    text: str | None = None


class LiveRunIn(BaseModel):
    """An invoice for the live pipeline. Only `invoice_text` is required."""

    invoice_text: str = Field(min_length=1, max_length=4000)
    source_agent: str = "agent-acme-seller"
    report: dict | None = None  # the sender's action report, if any
    report_signature: str | None = None
    pasted_by_maya: bool = False


class A2AMessageIn(BaseModel):
    agent_id: str
    text: str = Field(min_length=1, max_length=4000)
    report: dict | None = None
    signature: str | None = None


class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    account_holder: str = Field(min_length=1, max_length=120)
    account_number: str = Field(min_length=4, max_length=34)
    # The account holder as a CRS sandbox test identity (TruValidate body: firstName, lastName,
    # street1, city, state, zip, ssn). Optional: else data/crs_identities.json is used.
    holder_identity: dict | None = None
    holder_email: str | None = None
    # The supplier's own AI agent, if it sends invoices. Registered when Maya attests; its signing
    # secret is returned once, by the attest call.
    agent_id: str | None = Field(default=None, pattern=r"^agent-[a-z0-9-]{2,48}$")


class AttestIn(BaseModel):
    approver: str = "maya"
    approve: bool = True


class ToolDescriptionIn(BaseModel):
    description: str = Field(min_length=1, max_length=2000)


class HookIn(BaseModel):
    session_id: str | None = None
    tool_name: str
    tool_input: dict = {}
