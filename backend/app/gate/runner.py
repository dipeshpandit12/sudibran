"""Preset scenarios (A1–A9 and the three stories), Maya's approvals, and evidence reports.

Implements the frontend's run, approval and evidence contract. The backend additionally ensures:
- any outcome that moves money goes through the real policy engine, a one-time broker token
  and the payment tool (Nessie when configured);
- the unprotected side's payments really move on Nessie too, when configured;
- every event lands in the hash-chained audit table with the policy digest.
The live pipeline (app/gate/live.py) is where every check is decided for real."""

import copy
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import catalog
from app.db import ApprovalRow, ComponentRow, CrsCheckRow, InvoiceRow, PaymentRow, RunRow
from app.gate import payments, state
from app.integrations import crs, nessie
from app.policy.engine import policy_digest
from app.util import now, pad3, round2, usd

_MASKED = re.compile(r"\*{4}\d{4}")


def _matches_check(e: dict, c: dict) -> bool:
    return e["node"] == c["node"] and (not c.get("rule") or e.get("rule") == c.get("rule")) and e["decision"] != "allow"


async def run_scenario(s: AsyncSession, scenario_id: str, injection: str | None = None) -> dict:
    sc = catalog.scenario(scenario_id)
    assert sc is not None
    sw = await state.switches(s)
    counter = await state.next_counter(s)
    run_id = f"run-{pad3(counter)}-{scenario_id}"
    intent = await state.intent(s)

    prot = sc["protected"]
    events: list[dict] = copy.deepcopy(prot["events"])
    caught_at = prot["caught_at"]
    rule = prot["rule"]
    result = dict(prot["result"])
    raw_steps = list(sc["raw"]["steps"])
    harm = dict(sc["raw"]["harm"])
    raw_change = sc["raw"]["balance_change_usd"]
    via_layer_off = False
    note = None

    # Assume breach OFF: the model may resist on its own. Shown honestly on both sides.
    breach_idx = next((i for i, e in enumerate(events) if e["mechanism"] == "assume_breach"), -1)
    model_resisted = sc["kind"] == "attack" and not sw["assume_breach"] and breach_idx >= 0
    if model_resisted:
        events = events[:breach_idx] + [
            {**events[breach_idx], "decision": "allow", "reason": "Planner refused the injected instruction on its own"}
        ]
        caught_at, rule = "planner", None
        result = {
            "payment_status": "none", "balance_change_usd": 0, "alert_maya": False,
            "summary": "The model resisted this time. Sudibran doesn't count on that, so switch assume breach on "
            "to see a fully fooled model.",
        }
        raw_steps = [raw_steps[0], "The model spotted the injection and refused, this time",
                     "Nothing moved, but only because the model got lucky"]
        harm = {"type": "none", "amount_usd": 0, "detail": "Model resisted"}
        raw_change = 0
    elif sw["layer_off"]:
        check = catalog.check(sw["layer_off"])
        idx = next((i for i, e in enumerate(events) if check and _matches_check(e, check)), -1)
        if check and idx >= 0:
            marker = {**events[idx], "decision": "allow", "off": True, "reason": f"Check switched off: {check['label']}"}
            marker.pop("rule", None)
            ending = (prot.get("layer_off") or {}).get(check["key"])
            if ending:
                events = events[:idx] + [marker] + copy.deepcopy(ending["events_tail"])
                caught_at, rule = ending["caught_at"], ending["rule"]
                ending_result = ending.get("result") or {}
                result = {
                    **result, **ending_result,
                    "summary": ending_result.get("summary")
                    or f"With “{check['label']}” off, {catalog.NODE_LABEL[ending['caught_at']]} stopped it instead.",
                }
            else:
                events[idx] = marker
                note = "That check was off. The later checks on this path still held."
            via_layer_off = True
        elif check:
            note = f"“{check['label']}” isn't on this attack's path, so switching it off changes nothing here."

    # R4: no audit log, no payment.
    if sw["audit_down"] and result["payment_status"] in ("paid", "awaiting_maya"):
        cut = next((i for i, e in enumerate(events) if e["node"] in ("broker", "nessie", "maya")), -1)
        if cut >= 0:
            events = events[:cut]
        events.append({
            "node": "broker", "edge": ["policy", "broker"], "layer": "payment", "mechanism": "monitoring",
            "decision": "hold", "reason": "R4: the audit log can't be written, so the payment is on hold", "rule": "R4",
        })
        caught_at, rule = "broker", "R4"
        result = {**result, "payment_status": "on_hold", "balance_change_usd": 0,
                  "summary": "Audit log is down. The payment is paused until it's back (R4)."}

    # Records Maya sees in her app
    pay_spec = sc.get("payment")
    payment_id = f"pay-{pad3(counter)}" if pay_spec and result["payment_status"] != "none" else None
    if sc.get("invoice"):
        s.add(InvoiceRow(**sc["invoice"], run_id=run_id))
    approval_id = None
    payment_row = None
    if pay_spec and payment_id:
        payment_row = PaymentRow(
            id=payment_id, supplier=pay_spec["supplier"], amount_usd=pay_spec["amount_usd"],
            account_masked="****1234" if result["payment_status"] == "paid" and scenario_id == "A2" else pay_spec["account_masked"],
            status=result["payment_status"], reason=result["summary"], crs=pay_spec["crs"], run_id=run_id,
        )
        s.add(payment_row)
        if payment_row.status == "awaiting_maya":
            approval_id = f"apr-{pad3(counter)}"
            ask = next((e for e in events if e["decision"] == "ask"), None)
            threshold_text = f"{usd(intent['threshold_usd']).replace('.00', '')} threshold"
            s.add(ApprovalRow(
                id=approval_id, payment_id=payment_id, run_id=run_id,
                reason=(ask["reason"] if ask else result["summary"]).replace("$500 threshold", threshold_text),
                amount_usd=payment_row.amount_usd, supplier=payment_row.supplier,
                account_masked=payment_row.account_masked, crs=payment_row.crs, status="pending",
            ))

    # Component state changes
    if scenario_id == "A6" and caught_at == "proxy":
        tool = (await s.execute(select(ComponentRow).where(ComponentRow.id == "tool-invoice-reader"))).scalar_one_or_none()
        if tool:
            tool.status, tool.fingerprint = "quarantined", "7be0d415"
    if scenario_id == "A5" and caught_at == "seller":
        strikes = int(await state.kv_get(s, "seller_strikes", 0)) + 1
        await state.kv_set(s, "seller_strikes", strikes)
        if strikes >= 2:
            agent = (await s.execute(select(ComponentRow).where(ComponentRow.id == "agent-acme-seller"))).scalar_one_or_none()
            if agent:
                agent.status = "quarantined"
            events.append({
                "node": "seller", "edge": ["seller", "gate"], "layer": "other_agents", "mechanism": "access_control",
                "decision": "deny", "reason": "Second mismatch: seller agent quarantined until Maya re-approves it",
                "rule": "R3",
            })

    # CRS first (live when configured): a holder that isn't clean stops the money below.
    await _record_crs(s, run_id, events)
    crs_blocked = any(e["node"] == "crs" and e["decision"] != "allow" for e in events)

    # Real money, both sides. The protected side pays only through CRS → policy → broker → payment tool.
    if payment_row is not None and payment_row.status == "paid":
        if crs_blocked:
            result = _hold(payment_row, events, result, "CRS didn't clear the account holder, so the payment is on hold (R7)")
        else:
            result = await _settle_protected(s, run_id, payment_row, intent, events, result)
    raw_transfer = None
    if raw_change < 0:
        to = _raw_destination(sc, injection)
        if to:
            raw_transfer = await payments.raw_pay(to, -raw_change, run_id)

    stamped = await state.append_audit(s, run_id, events, payment_id, policy_digest())

    bal = await state.balances(s)
    raw_before, prot_before = bal["raw"], bal["protected"]
    bal["raw"] = round2(raw_before + raw_change)
    bal["protected"] = round2(prot_before + result["balance_change_usd"])
    await state.kv_set(s, "balances", bal)

    if sc["kind"] == "attack":
        sc_score = await state.score(s)
        sc_score["fired"] += 1
        if harm["type"] != "none":
            sc_score["harmed"] += 1
        sc_score["blocked"] += 1
        await state.kv_set(s, "score", sc_score)

    if result["alert_maya"]:
        where = f" at {catalog.NODE_LABEL[caught_at]}{f' ({rule})' if rule else ''}" if caught_at else ""
        await state.say(s, "sudibran", f"{sc['title']}: stopped{where}. {result['summary']}")

    out = {
        "run_id": run_id,
        "scenario_id": scenario_id,
        "kind": sc["kind"],
        "title": sc["title"],
        "injection": injection if injection is not None else sc["injection"],
        "invoice": sc.get("invoice"),
        "switches": sw,
        "raw": {"steps": raw_steps, "harm": harm, "balance_before": raw_before, "balance_after": bal["raw"]},
        "protected": {
            "events": stamped, "caught_at": caught_at, "rule": rule, "result": result,
            "balance_before": prot_before, "balance_after": bal["protected"], "approval_id": approval_id,
            "via_layer_off": via_layer_off, "model_resisted": model_resisted, "note": note,
        },
        "mode": "scripted",
    }
    if raw_transfer:
        out["raw"]["transfer"] = raw_transfer
    if payment_row is not None and payment_row.transfer_id:
        out["protected"]["transfer"] = {"rail": payment_row.rail, "transfer_id": payment_row.transfer_id}
    s.add(RunRow(run_id=run_id, data=copy.deepcopy(out)))
    await s.commit()
    state.publish(stamped)
    return out


def _raw_destination(sc: dict, injection: str | None) -> str | None:
    """Where the unprotected agent sends the money: the account in the injected text if there is
    one (it obeys the text), otherwise the account on the invoice."""
    for text in (injection, sc.get("injection")):
        m = _MASKED.search(text or "")
        if m:
            return m.group(0)
    pay_spec = sc.get("payment")
    return pay_spec["account_masked"] if pay_spec else None


async def _settle_protected(s: AsyncSession, run_id: str, payment_row: PaymentRow, intent: dict, events: list[dict],
                            result: dict) -> dict:
    """The scripted story says "paid". The real policy engine and the broker still have to agree,
    or the money doesn't move."""
    supplier = await state.supplier_by_name(s, payment_row.supplier)
    action = {"type": "pay", "amount_usd": payment_row.amount_usd, "payee_account": payment_row.account_masked,
              "payee_source": "record", "origin": "planner", "supplier_name": payment_row.supplier}
    decision = await payments.decide(s, payments.policy_input(intent, action, supplier, {"report_status": "verified"}, []))
    if decision["decision"] != "allow" or supplier is None:
        return _hold(payment_row, events, result, f"Policy engine didn't allow it ({decision['reason']}), so it's on hold")
    try:
        out = await payments.pay_supplier(s, run_id=run_id, payment_id=payment_row.id, supplier=supplier,
                                          amount=payment_row.amount_usd)
    except payments.PaymentFailed as e:
        return _hold(payment_row, events, result, f"The payment tool refused ({e}), so it's on hold")
    payment_row.rail, payment_row.transfer_id = out.get("rail"), out.get("transfer_id")
    for e in events:
        if e["node"] == "nessie" and e["decision"] == "allow" and out.get("rail") == "nessie":
            e["reason"] = f"{e['reason']} · Nessie withdrawal {out.get('transfer_id')} → deposit {out.get('deposit_id')}"
    return result


def _hold(payment_row: PaymentRow, events: list[dict], result: dict, reason: str) -> dict:
    payment_row.status, payment_row.reason = "on_hold", reason
    cut = next((i for i, e in enumerate(events) if e["node"] == "nessie"), len(events))
    del events[cut:]
    events.append({"node": "nessie", "edge": ["proxy", "nessie"], "layer": "payment", "mechanism": "monitoring",
                   "decision": "hold", "reason": reason})
    return {**result, "payment_status": "on_hold", "balance_change_usd": 0, "alert_maya": True, "summary": reason}


async def _record_crs(s: AsyncSession, run_id: str, events: list[dict]) -> None:
    """Scripted CRS steps are labelled simulated in the CRS log unless the live client is on, in
    which case the real sandbox answer replaces the scripted one."""
    for e in events:
        if e["node"] != "crs":
            continue
        account = (_MASKED.search(e["reason"]) or [None])[0] or "****1234"
        client = crs.client()
        if client.source == "live":
            res = await client.check(account)
            e["decision"] = {"clean": "allow", "flagged": "deny", "mismatch": "deny"}.get(res["result"], "hold")
            found = [x for x in res.get("signals", []) if not x.startswith("Fraud Finder")][:2]
            e["reason"] = f"R7: CRS {res['result']} for the holder of {account}" + (f" · {' · '.join(found)}" if found else "")
            e["rule"] = "R7"
            source, result, detail = "live", res["result"], res
        else:
            source, result, detail = "simulated", "flagged" if e["decision"] == "deny" else "clean", {"scripted": True}
        s.add(CrsCheckRow(run_id=run_id, subject=account, account_masked=account, result=result, source=source,
                          detail=detail, time=now()))


async def decide_approval(s: AsyncSession, approval_id: str, action: str) -> dict | None:
    approval = (await s.execute(select(ApprovalRow).where(ApprovalRow.id == approval_id))).scalar_one_or_none()
    if approval is None or approval.status != "pending":
        return None
    payment = (await s.execute(select(PaymentRow).where(PaymentRow.id == approval.payment_id))).scalar_one()
    sw = await state.switches(s)
    if action == "reject":
        approval.status, payment.status = "rejected", "blocked"
        payment.reason = "Maya rejected it on the Sudibran approval card"
        events = [{"node": "maya", "edge": ["gate", "maya"], "layer": "user_interface", "mechanism": "human_in_loop",
                   "decision": "deny", "reason": "Maya rejected the payment on the Sudibran card (R5)", "rule": "R5"}]
    else:
        approval.status = "approved"
        events = [{"node": "maya", "edge": ["gate", "maya"], "layer": "user_interface", "mechanism": "human_in_loop",
                   "decision": "allow", "reason": "Maya approved on the Sudibran card (R5)"}]
        if sw["audit_down"]:
            payment.status = "on_hold"
            payment.reason = "Approved, but the audit log is down, so it's on hold (R4)"
            events.append({"node": "broker", "edge": ["policy", "broker"], "layer": "payment", "mechanism": "monitoring",
                           "decision": "hold", "reason": "R4: the audit log can't be written, so the payment is on hold",
                           "rule": "R4"})
        else:
            events += await _pay_after_approval(s, payment)
    stamped = await state.append_audit(s, approval.run_id, events, payment.id, policy_digest())
    rr = await state.run_row(s, approval.run_id)
    if rr is not None:
        data = copy.deepcopy(rr.data)
        data["protected"]["events"] += copy.deepcopy(stamped)
        data["protected"]["result"] = {**data["protected"]["result"], "payment_status": payment.status,
                                       "summary": payment.reason}
        data["protected"]["balance_after"] = (await state.balances(s))["protected"]
        rr.data = data
    verdict = payment.reason.lower() if action == "approve" else "rejected by Maya"
    await state.say(s, "sudibran", f"{approval.supplier} {usd(approval.amount_usd)}: {verdict}.")
    out = {"approval": state.approval_dict(approval), "payment": state.payment_dict(payment), "events": stamped}
    await s.commit()
    state.publish(stamped)
    return out


async def _pay_after_approval(s: AsyncSession, payment: PaymentRow) -> list[dict]:
    """Maya's approval satisfies an "ask"; it never overrides a "deny". The policy engine is
    asked again with the payment as it stands now."""
    intent = await state.intent(s)
    supplier = await state.supplier_by_name(s, payment.supplier)
    action = {"type": "pay", "amount_usd": payment.amount_usd, "payee_account": payment.account_masked,
              "payee_source": "record", "origin": "planner", "supplier_name": payment.supplier}
    decision = await payments.decide(s, payments.policy_input(intent, action, supplier, {"report_status": "verified"}, []))
    if decision["decision"] == "deny" or supplier is None:
        payment.status, payment.reason = "blocked", f"Approved, but policy still denies it: {decision['reason']}"
        return [{"node": "policy", "edge": ["planner", "policy"], "layer": "workflow",
                 "mechanism": "formal_verification", "decision": "deny", "reason": decision["reason"],
                 "rule": decision.get("rule")}]
    try:
        out = await payments.pay_supplier(s, run_id=payment.run_id, payment_id=payment.id, supplier=supplier,
                                          amount=payment.amount_usd)
    except payments.PaymentFailed as e:
        payment.status, payment.reason = "on_hold", f"Approved, but the payment tool refused ({e}), so it's on hold"
        return [{"node": "nessie", "edge": ["proxy", "nessie"], "layer": "payment", "mechanism": "monitoring",
                 "decision": "hold", "reason": payment.reason}]
    payment.status, payment.reason = "paid", "Approved by Maya and paid"
    payment.rail, payment.transfer_id = out.get("rail"), out.get("transfer_id")
    bal = await state.balances(s)
    bal["protected"] = round2(bal["protected"] - payment.amount_usd)
    await state.kv_set(s, "balances", bal)
    paid = f"Paid {usd(payment.amount_usd)} to {payment.supplier} {payment.account_masked}"
    if out.get("rail") == "nessie":
        paid += f" · Nessie withdrawal {out.get('transfer_id')} → deposit {out.get('deposit_id')}"
    return [
        {"node": "broker", "edge": ["policy", "broker"], "layer": "payment", "mechanism": "credential",
         "decision": "allow", "reason": "One-time payment token issued"},
        {"node": "nessie", "edge": ["proxy", "nessie"], "layer": "payment", "mechanism": "monitoring",
         "decision": "allow", "reason": paid},
    ]


TOOL_NODES = ("proxy", "invoice_reader", "supplier_db", "crs", "broker", "nessie")


async def evidence(s: AsyncSession, run_id: str, layer: str | None = None) -> dict | None:
    rr = await state.run_row(s, run_id)
    if rr is None:
        return None
    run = rr.data
    sc = catalog.scenario(run["scenario_id"]) or {}
    events = await state.audit(s, run_id=run_id)
    crs_event = next((e for e in events if e["node"] == "crs"), None)
    messages = list(run.get("agent_messages") or [])
    injection = run.get("injection") or sc.get("injection")
    if not messages and injection:
        sid = run["scenario_id"]
        sender = ("maya (pasted text)" if sid == "A1" else
                  "tool-invoice-reader (description)" if sid == "A6" else "agent-acme-seller")
        messages.append({"from": sender, "text": injection, "labels": ["untrusted", "contains_instruction"]})
    elif not messages and run.get("invoice"):
        inv = run["invoice"]
        messages.append({"from": inv["source_agent"],
                         "text": f"Invoice {inv['id']} · {usd(inv['amount_usd'])} · report {inv['report_status']}",
                         "labels": ["untrusted"]})
    payment_ids = {e["payment_id"] for e in events if e.get("payment_id")}
    pay_rows = [] if not payment_ids else (
        await s.execute(select(PaymentRow).where(PaymentRow.id.in_(payment_ids)))).scalars().all()
    approvals = [a for a in await state.approvals(s) if a["run_id"] == run_id]
    decisions = [e for e in events if not layer or e["layer"] == layer]
    report = {
        "run_id": run_id,
        "scenario_id": run["scenario_id"],
        "title": run["title"],
        "generated_at": now(),
        "switches": run["switches"],
        "intent": await state.intent(s),
        "agent_messages": messages,
        "tool_calls": [e for e in decisions if e["node"] in TOOL_NODES],
        "decisions": decisions,
        "approvals": approvals,
        "crs": {"checked": True, "result": crs_event["reason"]} if crs_event
        else {"checked": False, "result": "Not needed: no new or changed account on this run"},
        "outcome": {**run["protected"]["result"], "caught_at": run["protected"]["caught_at"],
                    "rule": run["protected"]["rule"]},
        "chain": await state.verify_chain(s),
        # Backend-only additions (the frontend ignores unknown fields)
        "mode": run.get("mode", "scripted"),
        "policy_digest": policy_digest(),
        "money": {
            "payments": [{"id": p.id, "status": p.status, "rail": p.rail, "transfer_id": p.transfer_id} for p in pay_rows],
            "nessie_called": any(p.rail == "nessie" and p.transfer_id for p in pay_rows),
            "rail": nessie.mode(),
        },
        "integrations": run.get("backends") or {},
    }
    if layer:
        report["filtered_by_layer"] = layer
    return report
