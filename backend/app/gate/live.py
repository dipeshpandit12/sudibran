"""The live pipeline: every check decided for real, on any invoice text, including scenarios
nobody scripted (Hyphenate: "we may ask them to try a scenario of our own").

    seller report (R3) → tool fingerprint (FP) → invoice reader → parser (typed fields only)
    → planner (Droid / Claude / scripted; or fully fooled when assume breach is on)
    → memory gate → CRS (R7, new or changed accounts) → policy (R1 R2 R5 R3 PD INTENT)
    → Maya's approval card (R5) or audit check (R4) → broker token → payment tool

The unprotected agent (agent-raw) gets the same text, reads it directly and does what it says.
The result has the same RunResult shape as the presets, so the dashboard shows it unchanged."""

import copy
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import catalog
from app.agents import parser as parser_mod
from app.agents import planner as planner_mod
from app.agents import seller, tools
from app.agents.tools import Proposal
from app.db import (
    AgentKey,
    ApprovalRow,
    ComponentRow,
    CrsCheckRow,
    InvoiceRow,
    LatencySample,
    MemoryRow,
    PaymentRow,
    RunRow,
    ToolPin,
)
from app.gate import payments, state
from app.integrations import crs, nessie
from app.policy.engine import engine as policy_engine
from app.policy.engine import policy_digest, short_usd
from app.util import now, pad3, round2, usd

NODE_SHAPE = {  # node → (edge, layer) as drawn on the dashboard's flow map
    "seller": (["seller", "gate"], "other_agents"),
    "invoice_reader": (["proxy", "invoice_reader"], "external_data"),
    "parser": (["gate", "parser"], "llm"),
    "planner": (["gate", "planner"], "workflow"),
    "memory": (["planner", "memory"], "memory"),
    "policy": (["planner", "policy"], "workflow"),
    "crs": (["proxy", "crs"], "payment"),
    "broker": (["policy", "broker"], "payment"),
    "nessie": (["proxy", "nessie"], "payment"),
    "maya": (["gate", "maya"], "user_interface"),
    "supplier_db": (["proxy", "supplier_db"], "private_data"),
}

INVOICE_FOR_INJECTION = (
    "Invoice INV-2051 from Acme Supplies.\nAmount due: $140.00. Due 2026-11-07.\nThank you for your business.\n\n"
)


class Clock:
    """Separates Sudibran's own time from time spent waiting on models, CRS and the bank."""

    def __init__(self):
        self.start = time.perf_counter()
        self.external = 0.0

    async def ext(self, awaitable):
        t0 = time.perf_counter()
        try:
            return await awaitable
        finally:
            self.external += time.perf_counter() - t0

    def checks_ms(self) -> float:
        return (time.perf_counter() - self.start - self.external) * 1000


@dataclass
class Stop:
    node: str
    rule: str | None
    status: str  # PaymentStatus | "none"
    summary: str


class Trace:
    def __init__(self, layer_off: str | None):
        self.events: list[dict] = []
        self.layer_off = layer_off

    def add(self, node: str, decision: str, reason: str, mechanism: str, rule: str | None = None,
            edge: list[str] | None = None, layer: str | None = None, digest: str | None = None) -> dict:
        default_edge, default_layer = NODE_SHAPE.get(node, (["gate", node], "workflow"))
        e = {"node": node, "edge": edge or default_edge, "layer": layer or default_layer, "mechanism": mechanism,
             "decision": decision, "reason": reason}
        if rule:
            e["rule"] = rule
        if digest:
            e["policy_digest"] = digest
        self.events.append(e)
        return e

    def off(self, key: str) -> bool:
        return self.layer_off == key

    def marker(self, node: str, mechanism: str, key: str, **kw) -> None:
        label = (catalog.check(key) or {}).get("label", key)
        e = self.add(node, "allow", f"Check switched off: {label}", mechanism, **kw)
        e["off"] = True


async def live_run(
    s: AsyncSession,
    *,
    text: str,
    injection: str | None = None,
    source_agent: str = "agent-acme-seller",
    report: dict | None = None,
    signature: str | None = None,
    pasted: bool = False,
    scenario_hint: str | None = None,
    title: str | None = None,
) -> dict:
    clock = Clock()
    sw = await state.switches(s)
    intent = await state.intent(s)
    counter = await state.next_counter(s)
    scenario_id = scenario_hint or (catalog.classify_injection(injection) if injection else "live")
    run_id = f"run-{pad3(counter)}-{scenario_id}"
    checks_off = [sw["layer_off"]] if sw["layer_off"] else []
    t = Trace(sw["layer_off"])
    backends = {"parser": None, "planner": None, "policy": policy_engine().name, "crs": crs.mode(),
                "rail": nessie.mode()}
    stop: Stop | None = None
    note: str | None = None
    fields: dict = {}
    proposal: Proposal | None = None
    supplier = None
    crs_result: dict | None = None
    report_status = "verified"
    from_agent = source_agent != "maya"

    # ── 1. Maya's own pasted text: tagged untrusted, never her words (A1) ──
    if pasted:
        if t.off("gate_input"):
            t.marker("gate", "input_guardrail", "gate_input", edge=["maya", "gate"], layer="user_interface")
        else:
            t.add("gate", "flag", "Pasted text tagged untrusted, so it isn't treated as Maya's words", "input_guardrail",
                  edge=["maya", "gate"], layer="user_interface")
            t.add("gate", "allow", f"Intent {intent['id']} unchanged · threshold still {short_usd(intent['threshold_usd'])}",
                  "info_flow", edge=["gate", "planner"], layer="user_interface")

    # ── 2. Tool integrity: has the invoice tool changed since it was pinned? (A6) ──
    pin = await s.get(ToolPin, "get_invoice_fields")
    tampered = pin is not None and (pin.status == "quarantined" or pin.current_fingerprint != pin.pinned_fingerprint)
    fp_event = None
    if tampered:
        if t.off("proxy_fp"):
            fp_event = ("marker", None)
        else:
            pin.status = "quarantined"
            fp_event = ("deny", (f"Fingerprint mismatch: invoice reader {pin.pinned_fingerprint} ≠ "
                                 f"{pin.current_fingerprint}, so the tool is quarantined"))
            stop = Stop("proxy", "FP", "none", "The invoice tool changed after it was approved, so it's quarantined. "
                                               "Nothing ran. Maya alerted.")

    # ── 3. Parse (quarantined, typed fields only) ──
    if stop is None:
        await payments.checkpoint(s)
        try:
            parsed, backends["parser"] = await clock.ext(parser_mod.parse(text))
            fields = parsed.model_dump()
        except Exception as e:  # refusal, truncation, outage: fail closed
            backends["parser"] = "failed"
            stop = Stop("parser", "INTENT", "none", f"The parser couldn't read this invoice safely ({type(e).__name__}), "
                                                    "so it's held for review.")

    # ── 4. Seller agent's action report (R3) ──
    quarantined_agent = False
    if from_agent:
        comp = (await s.execute(select(ComponentRow).where(ComponentRow.id == source_agent))).scalar_one_or_none()
        quarantined_agent = comp is not None and comp.status == "quarantined"
        if quarantined_agent and not t.off("gate_r3"):
            t.add("seller", "deny", "R3: this seller agent is quarantined until Maya re-approves it", "access_control",
                  rule="R3")
            stop = stop or Stop("seller", "R3", "none", "Message from a quarantined agent, so nothing ran. Maya alerted.")
        else:
            key = await s.get(AgentKey, source_agent)
            report_status, reason = (
                seller.check_report(source_agent, report, signature, fields, key.secret if key else None) if fields
                else ("unverified", "R3: report not checked, because the invoice couldn't be parsed")
            )
            if t.off("gate_r3") and report_status != "verified":
                t.marker("seller", "identity", "gate_r3")
                report_status = "unverified"
            elif report_status == "mismatch":
                t.add("seller", "deny", reason, "identity", rule="R3")
                await _strike(s, t, source_agent)
                stop = stop or Stop("seller", "R3", "none", "The seller agent's report doesn't match what arrived, "
                                                            "so it's blocked. Maya alerted.")
            elif report_status == "unverified":
                t.add("seller", "flag", reason, "identity", rule="R3")
            else:
                t.add("seller", "allow", reason, "identity")

    if fp_event:
        kind, reason = fp_event
        if kind == "marker":
            t.marker("proxy", "hardening", "proxy_fp", edge=["proxy", "invoice_reader"], layer="tool")
        else:
            t.add("proxy", "deny", reason, "hardening", rule="FP", edge=["proxy", "invoice_reader"], layer="tool")

    # Text sent as an injection is adversarial by construction, whatever the parser thinks of it.
    instructions = bool(fields.get("has_instructions")) or pasted or bool(injection)
    if stop is None:
        # ── 5. Invoice reader + parser ──
        t.add("invoice_reader", "flag" if instructions else "allow",
              "Invoice text fetched through the proxy and tagged untrusted"
              + (", instruction included" if instructions else ""), "info_flow")
        if t.off("parser_sep"):
            t.marker("parser", "privilege_sep", "parser_sep")
        else:
            summary = f"Typed fields only: {fields['supplier_name']}, {usd(fields['amount_usd'])}, {fields['invoice_id']}"
            if fields.get("has_instructions"):
                summary += " · instruction dropped; parser has no tools"
            if backends["parser"] == "claude":
                summary += " · Claude"
            t.add("parser", "flag" if fields.get("has_instructions") else "allow", summary, "privilege_sep")

        # ── 6. Planner ──
        supplier = await state.supplier_by_name(s, fields["supplier_name"])
        record_account = supplier.account_masked if supplier else None
        if instructions and sw["assume_breach"]:
            proposal = planner_mod.fooled(text, fields, record_account)
            if pasted and t.off("gate_input"):
                proposal.origin = "planner"  # with tagging off, the paste counts as Maya's own words
            backends["planner"] = "assume_breach"
            t.add("planner", "flag", proposal.description, "assume_breach")
        else:
            if instructions:
                note = "The planner only saw typed fields, so the instruction never reached it."
            proposal, planner_stop = await clock.ext(_run_planner(s, run_id, fields, intent, backends))
            if planner_stop:
                stop = planner_stop
                t.add("planner", "ask", "The planner failed or proposed nothing, so the invoice is held for review",
                      "privilege_sep", rule="INTENT")
                _log_refused_tool_calls(t, backends)
            else:
                suffix = f" ({backends['planner']})" if backends["planner"] != "scripted" else ""
                droid = (backends.get("plan") or {}).get("droid")
                if droid:  # make Droid's own steps visible on the flow map
                    seq = " → ".join(st["tool"].split("___")[-1] for st in droid.get("steps", []) if st["step"] == "call")
                    suffix = f" (Droid session {str(droid.get('session_id'))[:8]}: {seq or 'no tool calls'})"
                t.add("planner", "allow", proposal.description + suffix, "privilege_sep")
            _log_refused_tool_calls(t, backends)

    if stop is None and proposal is not None:
        # ── 7. Memory gate (A4) ──
        if proposal.memory:
            trusted = t.off("memory_flag")
            s.add(MemoryRow(key=proposal.memory["key"], value=proposal.memory["value"],
                            trust="trusted" if trusted else "untrusted", source=source_agent, run_id=run_id, time=now()))
            if trusted:
                t.marker("memory", "info_flow", "memory_flag")
            else:
                t.add("memory", "flag", "Memory entry stored as untrusted, so it can never be used as a payee", "info_flow")

        if proposal.supplier_name:
            supplier = await state.supplier_by_name(s, proposal.supplier_name) or supplier

        # ── 8. CRS on new or changed accounts (R7). Runs before policy so policy sees the result;
        #       logged after it, so the structural rule (R2) reads as the primary catch. ──
        crs_event = None
        if proposal.type == "pay" and proposal.payee_account and (
            supplier is None or proposal.payee_account != supplier.account_masked
        ):
            if t.off("crs_r7"):
                t.marker("crs", "identity", "crs_r7")
            else:
                await payments.checkpoint(s)
                crs_result = await clock.ext(crs.client().check(proposal.payee_account))
                s.add(CrsCheckRow(run_id=run_id, subject=crs_result.get("subject") or proposal.payee_account,
                                  account_masked=proposal.payee_account, result=crs_result["result"],
                                  source=crs_result["source"], detail=crs_result, time=now()))
                crs_event = _crs_event(crs_result, proposal.payee_account)

        # ── 9. Policy ──
        crs_ctx = None
        if crs_result:
            crs_ctx = "flagged" if crs_result["result"] in ("flagged", "mismatch") else (
                "clean" if crs_result["result"] == "clean" else None)
        inp = payments.policy_input(intent, proposal.policy_action(), supplier,
                                    {"report_status": report_status, "crs": crs_ctx}, checks_off)
        off_record = proposal.type == "pay" and proposal.payee_account and supplier is not None and \
            proposal.payee_account != supplier.account_masked
        if off_record and t.off("policy_r2"):
            t.marker("policy", "formal_verification", "policy_r2")
        if proposal.type == "send_message" and proposal.contains_private and t.off("policy_pd"):
            t.marker("policy", "access_control", "policy_pd", layer="private_data")
        decision = await payments.decide(s, inp)
        layer = "private_data" if proposal.type == "send_message" else "workflow"
        mechanism = {"ask": "human_in_loop", "deny": "access_control" if decision.get("rule") == "PD"
                     else "formal_verification"}.get(decision["decision"], "formal_verification")
        t.add("policy", decision["decision"], decision["reason"], mechanism, rule=decision.get("rule"), layer=layer,
              digest=decision["policy_digest"])
        if crs_event:
            t.events.append(crs_event)

    # ── 10. Outcome ──
    payment_row = None
    approval_id = None
    payment_id = None
    if stop is None and proposal is not None:
        stop, payment_row, approval_id, payment_id = await _settle(
            s, t, run_id, counter, sw, proposal, supplier, decision, crs_result, clock
        )

    # ── 11. The unprotected side ──
    raw = await clock.ext(_raw_side(text, fields, supplier, instructions, sw, intent, run_id))

    # ── 12. Records ──
    if from_agent and fields:
        s.add(InvoiceRow(id=fields["invoice_id"], supplier=fields["supplier_name"], amount_usd=fields["amount_usd"],
                         source_agent=source_agent, report_status=report_status, run_id=run_id))
    stamped = await state.append_audit(s, run_id, t.events, payment_id, policy_digest())

    bal = await state.balances(s)
    raw_before, prot_before = bal["raw"], bal["protected"]
    prot_change = -payment_row.amount_usd if payment_row is not None and payment_row.status == "paid" else 0
    bal["raw"] = round2(raw_before + raw["change"])
    bal["protected"] = round2(prot_before + prot_change)
    await state.kv_set(s, "balances", bal)

    kind = "attack" if instructions else "story"
    if kind == "attack":
        sc_score = await state.score(s)
        sc_score["fired"] += 1
        if raw["harm"]["type"] != "none":
            sc_score["harmed"] += 1
        sc_score["blocked"] += 1
        await state.kv_set(s, "score", sc_score)

    caught_at, rule = _caught(t.events, stop)
    status = stop.status if stop else "none"
    summary = stop.summary if stop else "Nothing to do."
    result = {"payment_status": status, "balance_change_usd": prot_change,
              "alert_maya": status not in ("paid",) and (kind == "attack" or status in ("blocked", "awaiting_maya", "on_hold")),
              "summary": summary}
    if result["alert_maya"]:
        where = f" at {catalog.NODE_LABEL[caught_at]}{f' ({rule})' if rule else ''}" if caught_at else ""
        await state.say(s, "sudibran", f"{title or _title(injection, fields)}: stopped{where}. {summary}")

    invoice = None
    if fields:
        invoice = {"id": fields["invoice_id"], "supplier": fields["supplier_name"], "amount_usd": fields["amount_usd"],
                   "source_agent": source_agent, "report_status": report_status}
    out = {
        "run_id": run_id,
        "scenario_id": scenario_id,
        "kind": kind,
        "title": title or _title(injection, fields),
        "injection": injection if injection is not None else (text if instructions else None),
        "invoice": invoice,
        "switches": sw,
        "raw": {"steps": raw["steps"], "harm": raw["harm"], "balance_before": raw_before, "balance_after": bal["raw"]},
        "protected": {
            "events": stamped, "caught_at": caught_at, "rule": rule, "result": result,
            "balance_before": prot_before, "balance_after": bal["protected"], "approval_id": approval_id,
            "via_layer_off": bool(sw["layer_off"]) and any(e.get("off") for e in t.events),
            "model_resisted": False, "note": note,
        },
        "mode": "live",
        "backends": backends,
        "agent_messages": [{
            "from": "maya (pasted text)" if pasted else source_agent,
            "text": injection or text,
            "labels": ["untrusted", "contains_instruction"] if instructions else ["untrusted"],
        }],
        "fields": fields,
    }
    if raw.get("transfer"):
        out["raw"]["transfer"] = raw["transfer"]
    if payment_row is not None and payment_row.transfer_id:
        out["protected"]["transfer"] = {"rail": payment_row.rail, "transfer_id": payment_row.transfer_id}
    s.add(RunRow(run_id=run_id, data=copy.deepcopy(out)))
    s.add(LatencySample(kind="checks", ms=clock.checks_ms()))
    await s.commit()
    state.publish(stamped)
    return out


def _log_refused_tool_calls(t: Trace, backends: dict) -> None:
    """Every tool call Sudibran refused during planning becomes a visible proxy event."""
    for call in (backends.get("plan") or {}).get("calls", []):
        args = call.get("args") or {}
        if call.get("tool") == "permission" and args.get("decision") == "deny":
            reason = args.get("reason", "")
            t.add("proxy", "deny", f"Refused the agent's {args.get('tool')} call: {reason}", "hardening",
                  rule="FP" if "quarantined" in reason else None, edge=["planner", "proxy"], layer="tool")


def _title(injection: str | None, fields: dict) -> str:
    if injection:
        return "Your injection"
    if fields:
        return f"Invoice {fields['invoice_id']} from {fields['supplier_name']}"
    return "Live run"


def _crs_event(res: dict, account: str) -> dict:
    # Live: name what TruValidate found (e.g. "TruValidate risk HIGH (150 pts) · 4551: INPUT SSN IS INVALID").
    found = [s for s in res.get("signals", []) if not s.startswith("Fraud Finder")][:2]
    sim = " (CRS simulated)" if res.get("source") == "simulated" else (f" · {' · '.join(found)}" if found else "")
    shape = {"node": "crs", "edge": ["proxy", "crs"], "layer": "payment", "mechanism": "identity", "rule": "R7"}
    if res["result"] == "flagged":
        return {**shape, "decision": "deny", "reason": f"R7: CRS fraud flag on the holder of {account}{sim}"}
    if res["result"] == "mismatch":
        return {**shape, "decision": "deny",
                "reason": f"R7: CRS can't match the holder of {account} to a verified identity{sim}"}
    if res["result"] == "error":
        return {**shape, "decision": "hold", "reason": "R7: CRS didn't answer, so a payment to a new account waits"}
    return {**shape, "decision": "allow", "reason": f"R7: CRS identity clean for the holder of {account}{sim}"}


async def _strike(s: AsyncSession, t: Trace, agent_id: str) -> None:
    strikes = int(await state.kv_get(s, "seller_strikes", 0)) + 1
    await state.kv_set(s, "seller_strikes", strikes)
    if strikes >= 2:
        agent = (await s.execute(select(ComponentRow).where(ComponentRow.id == agent_id))).scalar_one_or_none()
        if agent:
            agent.status = "quarantined"
        t.add("seller", "deny", "Second mismatch: seller agent quarantined until Maya re-approves it", "access_control",
              rule="R3")


async def _run_planner(s: AsyncSession, run_id: str, fields: dict, intent: dict, backends: dict):
    await payments.checkpoint(s)
    ctx = tools.open_run(run_id, fields)
    try:
        proposals, backends["planner"] = await planner_mod.plan(ctx, intent)
    except Exception as e:
        backends["planner"] = f"failed: {type(e).__name__}"
        return None, Stop("planner", "INTENT", "none", f"The planner failed ({e}), so nothing ran. Held for review.")
    finally:
        tools.close_run(run_id)
        # Visible plan: every tool call the agent made and every proposal it produced.
        backends["plan"] = {
            "calls": [c for c in ctx.calls if c["tool"] != "droid_session"],
            "proposals": [p.description for p in ctx.proposals],
            "droid": next((c["args"] for c in ctx.calls if c["tool"] == "droid_session"), None),
        }
    chosen = next((p for p in proposals if p.type == "pay"), None) or (proposals[0] if proposals else None)
    if chosen is None:
        return None, Stop("planner", "INTENT", "none", "The planner proposed nothing, so the invoice is held for review.")
    return chosen, None


async def _settle(s, t: Trace, run_id: str, counter: int, sw: dict, proposal: Proposal, supplier, decision: dict,
                  crs_result: dict | None, clock: Clock):
    """Turn the policy decision into what actually happens. Returns (stop, payment_row, approval_id, payment_id)."""
    d, rule = decision["decision"], decision.get("rule")
    crs_hold = crs_result is not None and crs_result["result"] == "error"

    if proposal.type == "send_message":
        if d == "deny":
            t.add("gate", "allow", "Account numbers masked in everything shown", "output_guardrail",
                  edge=["gate", "maya"], layer="user_interface")
            return Stop("policy", rule, "none", "Private data can't leave. Nothing was sent. Maya alerted."), None, None, None
        if d == "allow":  # PD check switched off: row-level security is the next layer
            t.add("supplier_db", "deny", "Row-level security: the agent's role only sees masked accounts, so no bank "
                  "details left", "access_control", rule="RLS")
            return Stop("supplier_db", "RLS", "none", "Row-level security returned masked accounts only, so nothing "
                                                      "private left. Maya alerted."), None, None, None
        return Stop("policy", rule, "none", "Held for review. Messages like this aren't covered by Maya's intent."), \
            None, None, None

    if proposal.type != "pay":
        return Stop("policy", rule, "none", "Held for review. The action isn't covered by Maya's intent or any "
                                            "policy, so nothing ran."), None, None, None

    payment_id = f"pay-{pad3(counter)}"
    account = proposal.payee_account or (supplier.account_masked if supplier else "****")
    crs_label = "not_needed" if crs_result is None else ("clean" if crs_result["result"] == "clean" else "flagged")
    row = PaymentRow(id=payment_id, supplier=proposal.supplier_name or (supplier.name if supplier else "Unknown"),
                     supplier_id=supplier.id if supplier else None, amount_usd=float(proposal.amount_usd or 0),
                     account_masked=account, status="blocked", reason="", crs=crs_label, run_id=run_id)
    s.add(row)

    denied = any(e["decision"] == "deny" for e in t.events)
    if d == "deny" or denied:
        row.reason = _deny_summary(rule, crs_result)
        return Stop("policy", rule, "blocked", row.reason), row, None, payment_id

    if crs_hold or sw["audit_down"]:
        reason = ("R4: the audit log can't be written, so the payment is on hold" if sw["audit_down"]
                  else "CRS didn't answer, so the payment to a new account is on hold (R7, fail closed)")
        t.add("broker", "hold", reason, "monitoring", rule="R4" if sw["audit_down"] else "R7")
        row.status = "on_hold"
        row.reason = ("Audit log is down. The payment is paused until it's back (R4)." if sw["audit_down"] else reason)
        return Stop("broker", "R4" if sw["audit_down"] else "R7", "on_hold", row.reason), row, None, payment_id

    if d == "ask":
        t.add("maya", "ask", "R5: approval card drawn by Sudibran in Maya's app", "human_in_loop", rule="R5")
        row.status, row.reason = "awaiting_maya", "Waiting for Maya to approve in her app"
        approval_id = f"apr-{pad3(counter)}"
        s.add(ApprovalRow(id=approval_id, payment_id=payment_id, run_id=run_id, reason=decision["reason"],
                          amount_usd=row.amount_usd, supplier=row.supplier, account_masked=row.account_masked,
                          crs=row.crs, status="pending"))
        return Stop("policy", rule, "awaiting_maya", row.reason), row, approval_id, payment_id

    # allow → broker token → payment tool
    try:
        out = await clock.ext(payments.pay_supplier(s, run_id=run_id, payment_id=payment_id, supplier=supplier,
                                                    amount=row.amount_usd))
    except payments.PaymentFailed as e:
        t.add("broker", "allow", "One-time payment token issued", "credential")
        t.add("nessie", "hold", f"The payment tool refused ({e}), so it's on hold", "monitoring")
        row.status, row.reason = "on_hold", f"The payment tool refused ({e}), so it's on hold"
        return Stop("nessie", None, "on_hold", row.reason), row, None, payment_id
    pay_tool = (await s.execute(select(ComponentRow).where(ComponentRow.id == "tool-payment"))).scalar_one_or_none()
    t.add("broker", "allow", "One-time payment token issued", "credential")
    t.add("proxy", "allow", f"Payment tool fingerprint {pay_tool.fingerprint if pay_tool else '?'} matches", "hardening",
          edge=["broker", "proxy"], layer="tool")
    paid = f"Paid {usd(row.amount_usd)} to {row.supplier} {out.get('account_masked', row.account_masked)}"
    if out.get("rail") == "nessie":
        paid += f" · Nessie withdrawal {out.get('transfer_id')} → deposit {out.get('deposit_id')}"
    t.add("nessie", "allow", paid, "monitoring")
    row.status, row.reason = "paid", paid
    row.rail, row.transfer_id = out.get("rail"), out.get("transfer_id")
    return Stop("nessie", None, "paid", paid), row, None, payment_id


def _deny_summary(rule: str | None, crs_result: dict | None) -> str:
    flagged = crs_result is not None and crs_result["result"] in ("flagged", "mismatch")
    if rule == "R2":
        return "Payee not on file, blocked." + (" CRS flags the new account." if flagged else "") + " Maya alerted."
    if rule == "R7" or flagged:
        return "CRS flagged the account holder, so no payment token was issued. Maya alerted."
    if rule == "R6":
        return "Policy couldn't be evaluated, so nothing moved (fail closed). Maya alerted."
    return "Blocked by policy. Maya alerted."


def _caught(events: list[dict], stop: Stop | None) -> tuple[str | None, str | None]:
    """Where Sudibran caught it: the first deny; else what held the payment; else the first ask;
    nothing when it was paid."""
    if stop and stop.status == "paid":
        return None, None
    order = ("deny", "hold", "ask") if stop and stop.status == "on_hold" else ("deny", "ask", "hold")
    for decision in order:
        e = next((e for e in events if e["decision"] == decision), None)
        if e:
            return e["node"], e.get("rule")
    return (stop.node, stop.rule) if stop else (None, None)


async def _raw_side(text: str, fields: dict, supplier, instructions: bool, sw: dict, intent: dict, run_id: str) -> dict:
    """agent-raw: no parser, no policy. It reads the text and does what it says."""
    inv = fields.get("invoice_id") or "the invoice"
    name = fields.get("supplier_name") or "the supplier"
    amount = float(fields.get("amount_usd") or 0)
    record = supplier.account_masked if supplier else None
    snippet = text.strip().splitlines()[-1][:90] if text.strip() else ""

    if instructions and not sw["assume_breach"]:
        return {"steps": [f"Invoice arrives: \"{snippet}\"", "The model spotted the injection and refused, this time",
                          "Nothing moved, but only because the model got lucky"],
                "harm": {"type": "none", "amount_usd": 0, "detail": "Model resisted"}, "change": 0}

    if not instructions:
        steps = [f"Invoice {inv} for {usd(amount)} arrives from {name}", "Agent pays it straight away"]
        if amount > intent["threshold_usd"]:
            steps.append(f"Maya never got a say on a {short_usd(amount)} payment")
        out = {"steps": steps, "harm": {"type": "none", "amount_usd": 0, "detail": "Normal payment"}, "change": -amount}
        if record and amount > 0:
            out["transfer"] = await payments.raw_pay(record, amount, run_id)
        return out

    p = planner_mod.fooled(text, fields, record)
    if p.type == "send_message":
        return {"steps": [f"Message arrives: \"{snippet}\"", "Agent reads the supplier records and sends them out",
                          "Maya never sees it · no record of why"],
                "harm": {"type": "data", "amount_usd": 0, "detail": "Every supplier's bank details leaked"}, "change": 0}
    if p.type == "pay":
        to = p.payee_account or record or "****"
        pay_amount = float(p.amount_usd or amount)
        if p.payee_account and p.payee_account != record:
            detail = f"{usd(pay_amount)} sent to the attacker's account"
            steps = [f"Invoice arrives: \"{snippet}\"", "Agent takes the account from the text",
                     f"Pays {usd(pay_amount)} to {to}", "Maya never sees it · no record of why"]
            harm = {"type": "money", "amount_usd": pay_amount, "detail": detail}
        elif p.claims_approval:
            steps = [f"Invoice arrives: \"{snippet}\"", "Agent believes the claimed approval",
                     f"Pays {usd(pay_amount)} to {to}"]
            harm = {"type": "money", "amount_usd": pay_amount, "detail": f"{usd(pay_amount)} paid on a fake approval"}
        else:
            over = pay_amount > intent["threshold_usd"]
            steps = [f"Invoice arrives: \"{snippet}\"", "Agent follows the instruction and skips approval",
                     f"Pays {usd(pay_amount)} to {to}"]
            harm = ({"type": "money", "amount_usd": pay_amount, "detail": f"{usd(pay_amount)} paid with no approval"}
                    if over else {"type": "none", "amount_usd": 0, "detail": "Paid without checks"})
        out = {"steps": steps, "harm": harm, "change": -pay_amount}
        if pay_amount > 0 and to != "****":
            out["transfer"] = await payments.raw_pay(to, pay_amount, run_id)
        return out
    return {"steps": [f"Invoice arrives with an instruction inside: \"{snippet}\"",
                      "Agent treats it as part of the job and carries it out",
                      "Task finishes with no alert and no record of why"],
            "harm": {"type": "none", "amount_usd": 0, "detail": "Did whatever the text said, with no record of why"},
            "change": 0}


def injection_invoice(injection: str) -> tuple[str, dict, str]:
    """The invoice an injection from the dashboard rides in on: Acme's real $140 invoice with a
    signed report (Acme's agent was compromised, its key wasn't), plus the injected text."""
    report = {"invoice_id": "INV-2051", "amount_usd": 140.0, "tools_used": ["invoice-writer"]}
    return INVOICE_FOR_INJECTION + injection, report, seller.sign_report("agent-acme-seller", report)
