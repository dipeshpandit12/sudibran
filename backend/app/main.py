"""Sudibran gate: the FastAPI app the frontend talks to.

    uv run uvicorn app.main:app --reload --port 8000

/api/* keeps the contract consumed by frontend/lib/api.ts and frontend/lib/types.ts.
New endpoints are listed in README.md."""

import asyncio
import re
import secrets
import shutil
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from app import catalog, schemas
from app.agents import tools
from app.broker import client as broker_client
from app.config import get_settings
from app.db import (
    AgentKey,
    AuditRow,
    ComponentRow,
    CrsCheckRow,
    IntentRow,
    MemoryRow,
    SupplierRow,
    ToolPin,
    create_all,
    dispose,
    is_postgres,
    session,
)
from app.gate import events as bus
from app.gate import live, runner, state
from app.gate.metrics import metrics as compute_metrics
from app.integrations import crs, nessie
from app.policy import engine as policy
from app.proxy import server as proxy
from app.security import keys
from app.util import mask, now, sha256_hex, usd

mcp_endpoint = proxy.McpEndpoint()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await create_all()
    async with session() as s:
        await state.ensure_seeded(s)
    async with mcp_endpoint.running():
        yield
    await dispose()


app = FastAPI(
    title="Sudibran gate",
    version="0.1.0",
    description="The black box for AI financial actions: the security layer between an AI agent and the money.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.router.routes.append(proxy.route(mcp_endpoint))  # MCP at /mcp (local mode)


# Errors look like the prototype's: {"error": "..."} with a 4xx status.
@app.exception_handler(HTTPException)
async def _http_error(_req: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def _validation_error(_req: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(x) for x in first.get("loc", []) if x != "body")
    return JSONResponse({"error": f"{where}: {first.get('msg', 'invalid request')}".strip(": ")}, status_code=400)


def fail(status: int, message: str):
    raise HTTPException(status_code=status, detail=message)


# ───────────────────────── the prototype's contract ─────────────────────────


@app.get("/api/state", response_model=schemas.DemoState, tags=["contract"])
async def get_state():
    async with session() as s:
        return await state.get_state(s)


@app.get("/api/components", response_model=list[schemas.Component], tags=["contract"])
async def get_components():
    async with session() as s:
        return await state.components(s)


@app.get("/api/checks", response_model=list[schemas.Check], tags=["contract"])
async def get_checks():
    return catalog.checks()


@app.post("/api/intents", response_model=schemas.Intent, tags=["contract"])
async def save_intent(body: schemas.IntentIn):
    if not (body.text or "").strip() or body.threshold_usd is None or body.threshold_usd <= 0:
        fail(400, "Intent text and a positive threshold are required.")
    async with state.lock, session() as s:
        current = await state.intent(s)
        new = {**current, "text": body.text.strip(), "threshold_usd": body.threshold_usd, "signed": True,
               "created_at": now()}
        s.add(IntentRow(**new, signature=keys.sign(keys.intent_message(new))))
        await state.say(s, "sudibran", f"Intent {new['id']} updated and signed. Threshold: {usd(body.threshold_usd)}.")
        await s.commit()
        return new


@app.get("/api/chat", response_model=list[schemas.ChatMessage], tags=["contract"])
async def get_chat():
    async with session() as s:
        return await state.chat(s)


@app.post("/api/chat", response_model=list[schemas.ChatMessage], tags=["contract"])
async def post_chat(body: schemas.ChatIn):
    msg = (body.text or "").strip()
    if not msg:
        fail(400, "Message text is required.")
    pasted = bool(body.pasted)
    async with state.lock, session() as s:
        await state.say(s, "maya", msg, pasted)
        if pasted:
            await state.say(s, "sudibran", "Pasted text is tagged untrusted. It can inform the agent, but it can't "
                                           "change your intent or approve a payment.")
            await state.say(s, "agent", "I've read the pasted email. I'll only act on it through the normal checks.")
        else:
            await state.say(s, "agent", "Noted. Anything that moves money still goes through Sudibran first.")
        await s.commit()
        return await state.chat(s)


@app.get("/api/invoices", response_model=list[schemas.Invoice], tags=["contract"])
async def get_invoices():
    async with session() as s:
        return await state.invoices(s)


@app.get("/api/payments", response_model=list[schemas.Payment], tags=["contract"])
async def get_payments():
    async with session() as s:
        return await state.payments(s)


@app.get("/api/approvals", response_model=list[schemas.Approval], tags=["contract"])
async def get_approvals():
    async with session() as s:
        return await state.approvals(s)


@app.post("/api/approvals/{approval_id}", response_model=schemas.DecisionOut, tags=["contract"])
async def decide(approval_id: str, body: schemas.ApprovalIn):
    if body.action not in ("approve", "reject"):
        fail(400, "Action must be approve or reject.")
    async with state.lock, session() as s:
        out = await runner.decide_approval(s, approval_id, body.action)
    if out is None:
        fail(404, f"Approval {approval_id} isn't pending.")
    return out


@app.get("/api/attacks", response_model=list[schemas.AttackInfo], tags=["contract"])
async def get_attacks():
    return catalog.attacks()


@app.get("/api/scenarios", response_model=list[schemas.ScenarioInfo], tags=["contract"])
async def get_scenarios():
    """Preset labels and input text for clients; scenario outcomes are never sent as static data."""
    return catalog.scenario_catalog()


@app.post("/api/attacks/{attack_id}", response_model=schemas.RunResult, tags=["contract"])
async def run_attack(attack_id: str):
    if not re.fullmatch(r"A[1-9]", attack_id) or not catalog.has_scenario(attack_id):
        fail(404, f"Unknown attack {attack_id}.")
    async with state.lock, session() as s:
        return await runner.run_scenario(s, attack_id)


@app.post("/api/story/{story_id}", response_model=schemas.RunResult, tags=["contract"])
async def run_story(story_id: str):
    if story_id not in catalog.STORIES or not catalog.has_scenario(story_id):
        fail(404, f"Unknown story {story_id}.")
    async with state.lock, session() as s:
        return await runner.run_scenario(s, story_id)


@app.post("/api/inject", response_model=schemas.RunResult, tags=["contract"])
async def inject(body: schemas.InjectIn):
    injection = (body.text or "").strip()
    if not injection:
        fail(400, "Type an injection to send, or pick a preset.")
    if len(injection) > 600:
        fail(400, "Keep the injection under 600 characters.")
    async with state.lock, session() as s:
        if get_settings().inject_mode == "scripted":
            return await runner.run_scenario(s, catalog.classify_injection(injection), injection=injection)
        text_, report, signature = live.injection_invoice(injection)
        return await live.live_run(s, text=text_, injection=injection, report=report, signature=signature)


@app.get("/api/switches", response_model=schemas.DemoSwitches, tags=["contract"])
async def get_switches():
    async with session() as s:
        return await state.switches(s)


@app.post("/api/switches", response_model=schemas.DemoSwitches, tags=["contract"])
async def set_switches(body: schemas.SwitchesPatch):
    async with state.lock, session() as s:
        sw = await state.switches(s)
        for key in body.model_fields_set:
            sw[key] = getattr(body, key)
        if sw.get("layer_off") and not catalog.check(sw["layer_off"]):
            sw["layer_off"] = None
        await state.kv_set(s, "switches", sw)
        await s.commit()
        return sw


@app.post("/api/demo/reset", response_model=schemas.DemoState, tags=["contract"])
async def reset():
    async with state.lock, session() as s:
        await state.reset(s)
        return await state.get_state(s)


@app.get("/api/evidence/{run_id}", response_model=schemas.EvidenceReport, tags=["contract"])
async def get_evidence(run_id: str, layer: str | None = None):
    async with session() as s:
        report = await runner.evidence(s, run_id, layer)
    if report is None:
        fail(404, f"No run called {run_id} in this session. Runs clear on Reset.")
    return report


# ───────────────────────── new: live pipeline, agents, audit ─────────────────────────


@app.post("/api/live/run", response_model=schemas.RunResult, tags=["live"])
async def live_run(body: schemas.LiveRunIn):
    """Run any invoice text through every real check (Hyphenate's "a scenario of our own")."""
    async with state.lock, session() as s:
        return await live.live_run(
            s, text=body.invoice_text, source_agent="maya" if body.pasted_by_maya else body.source_agent,
            report=body.report, signature=body.report_signature, pasted=body.pasted_by_maya,
        )


@app.post("/api/a2a/messages", response_model=schemas.RunResult, tags=["live"])
async def a2a_message(body: schemas.A2AMessageIn):
    """Another agent (the supplier's) sends an invoice. This is the trigger that starts the AP agent."""
    async with session() as s:
        agents = {c["id"] for c in await state.components(s) if c["type"] == "agent"}
    if body.agent_id not in agents:
        fail(403, f"Unknown agent {body.agent_id}. Agents must be registered before they can message Maya's agent.")
    async with state.lock, session() as s:
        return await live.live_run(s, text=body.text, source_agent=body.agent_id, report=body.report,
                                   signature=body.signature)


@app.get("/api/runs/{run_id}/plan", tags=["live"])
async def run_plan(run_id: str):
    """Droid's (or the planner's) plan, steps and result for one run."""
    async with session() as s:
        rr = await state.run_row(s, run_id)
        if rr is None:
            fail(404, f"No run called {run_id}.")
        events = await state.audit(s, run_id=run_id)
    data = rr.data
    return {
        "run_id": run_id,
        "mode": data.get("mode", "scripted"),
        "backends": {k: v for k, v in (data.get("backends") or {}).items() if k != "plan"},
        "fields_seen_by_planner": data.get("fields"),
        "plan": (data.get("backends") or {}).get("plan"),
        "steps": [{"seq": e["seq"], "node": e["node"], "decision": e["decision"], "reason": e["reason"],
                   "rule": e.get("rule")} for e in events],
        "result": data["protected"]["result"],
    }


@app.get("/api/audit", tags=["audit"])
async def get_audit(run_id: str | None = None, layer: str | None = None, after_seq: int = 0):
    async with session() as s:
        return await state.audit(s, run_id=run_id, layer=layer, after_seq=after_seq)


@app.get("/api/audit/verify", tags=["audit"])
async def verify_audit():
    async with session() as s:
        chain = await state.verify_chain(s)
        digests = sorted({d for (d,) in (await s.execute(select(AuditRow.policy_digest))).all() if d})
    return {**chain, "policy_digest_now": policy.policy_digest(), "policy_digests_seen": digests,
            "append_only_enforced_by": "postgres trigger" if is_postgres() else "application (sqlite dev mode)"}


@app.websocket("/api/events")
async def ws_events(ws: WebSocket):
    """Every audit event as it's written. Visualisation only: never in the decision path."""
    await ws.accept()
    q = bus.subscribe()
    try:
        while True:
            await ws.send_json(await q.get())
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        bus.unsubscribe(q)


@app.get("/api/metrics", tags=["audit"])
async def get_metrics():
    async with session() as s:
        return await compute_metrics(s)


@app.get("/api/health", tags=["audit"])
async def health():
    s_ = get_settings()
    db_ok = True
    try:
        async with session() as s:
            await s.execute(text("select 1"))
    except Exception:
        db_ok = False
    policy_ok = True
    if s_.policy_engine == "opa":
        probe = await policy.OpaPolicy(s_.opa_url).decide({"action": {"type": "remember"}})
        policy_ok = probe["decision"] == "allow"
    parser = "service" if s_.parser_url else ("claude" if s_.anthropic_api_key_parser else "offline")
    planner = s_.planner if not (s_.planner == "claude" and not s_.anthropic_api_key_planner) else "scripted"
    droid_found = bool(shutil.which(s_.droid_bin))
    planner_health = {"mode": planner, "droid_installed": droid_found}
    if planner == "droid":
        planner_health.update({
            "model": s_.droid_model or "droid default",
            "authentication": "factory_api_key" if s_.factory_api_key else "droid_login",
            "provider_key_forwarded": False,
        })
    integrations = {
        "database": {"ok": db_ok, "engine": "postgres" if is_postgres() else "sqlite"},
        "policy": {"ok": policy_ok, "engine": s_.policy_engine, "digest": policy.policy_digest()},
        "parser": {"mode": parser, "model": s_.parser_model if parser == "claude" else None},
        "planner": planner_health,
        "payment_rail": {"mode": nessie.mode()},
        "crs": {"mode": crs.mode()},
        "signing": {"alg": "Ed25519"},
    }
    real = {
        "Policy decisions (R1, R2, R3, R5, R7, PD, INTENT)": True,
        "Hash-chained audit log": True,
        "One-time payment tokens": True,
        "Capital One Nessie transfers": nessie.mode() == "live",
        "CRS identity and fraud checks": crs.mode() == "live",
        "Claude parser": parser in ("claude", "service"),
        "Planner": planner in ("claude", "droid"),
    }
    return {
        "status": "ok" if db_ok and policy_ok else "degraded",
        "integrations": integrations,
        "real_vs_simulated": [{"part": k, "real": v} for k, v in real.items()],
        "always_simulated": [
            "Assume breach: when on, the planner is forced to obey injected text (a stand-in for a fully fooled model).",
            "Preset scenarios (A1–A9, the three stories) replay scripted checks; money, tokens and audit are real.",
        ],
    }


@app.get("/api/keys", tags=["audit"])
async def public_key():
    return {"alg": "Ed25519", "pem": keys.public_key_pem()}


@app.get("/api/intents/current", tags=["audit"])
async def current_intent():
    """Maya's intent with its signature, and whether the signature checks out."""
    async with session() as s:
        row = await state.current_intent_row(s)
    intent = state.intent_dict(row)
    return {"intent": intent, "signature": row.signature,
            "signature_valid": bool(row.signature) and keys.verify(keys.intent_message(intent), row.signature)}


@app.get("/api/memory", tags=["live"])
async def get_memory():
    async with session() as s:
        rows = (await s.execute(select(MemoryRow).order_by(MemoryRow.seq))).scalars().all()
    return [{"key": r.key, "value": r.value, "trust": r.trust, "source": r.source, "run_id": r.run_id, "time": r.time}
            for r in rows]


# ───────────────────────── suppliers: CRS-gated enrollment (stage 1) ─────────────────────────


@app.get("/api/suppliers", tags=["suppliers"])
async def list_suppliers():
    async with session() as s:
        rows = (await s.execute(select(SupplierRow).order_by(SupplierRow.seq))).scalars().all()
        checks = (await s.execute(select(CrsCheckRow).order_by(CrsCheckRow.seq.desc()))).scalars().all()
    latest = {}
    for c in checks:
        latest.setdefault(c.account_masked, c)
    return [{**state.supplier_dict(r), "status": r.status, "holder": r.holder,
             "crs_check": None if r.account_masked not in latest else {
                 "result": latest[r.account_masked].result, "source": latest[r.account_masked].source,
                 "time": latest[r.account_masked].time}} for r in rows]


@app.post("/api/suppliers", tags=["suppliers"])
async def enroll_supplier(body: schemas.SupplierIn):
    """New supplier or bank account: CRS identity + fraud check first, then Maya attests.
    Untrusted text can never create a trusted payee; this is the only way in."""
    masked = mask(body.account_number)
    async with state.lock, session() as s:
        existing = await state.supplier_by_name(s, body.name)
        if existing is not None and existing.name.lower() == body.name.lower():
            fail(409, f"{body.name} is already on file. A changed account is enrolled as a new record and attested.")
        if body.agent_id and (
            await s.get(AgentKey, body.agent_id)
            or (await s.execute(select(ComponentRow).where(ComponentRow.id == body.agent_id))).scalar_one_or_none()
        ):
            fail(409, f"Agent {body.agent_id} is already registered.")
        counter = await state.next_counter(s)
        run_id = f"enroll-{counter:03d}"
        result = await crs.client().check(masked, identity=body.holder_identity, email=body.holder_email)
        s.add(CrsCheckRow(run_id=run_id, subject=result.get("subject") or body.account_holder, account_masked=masked,
                          result=result["result"], source=result["source"], detail=result, time=now()))
        ok = result["result"] == "clean"
        supplier_id = "sup-" + re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")
        s.add(SupplierRow(
            id=supplier_id, name=body.name, account_masked=masked, account_sha256=sha256_hex(body.account_number),
            holder=body.account_holder, crs="clean" if ok else "flagged", crs_subject=result.get("subject"),
            status="pending_attestation" if ok else "refused", agent_id=body.agent_id,
        ))
        sim = " (CRS simulated)" if result["source"] == "simulated" else ""
        events = [{
            "node": "crs", "edge": ["proxy", "crs"], "layer": "payment", "mechanism": "identity", "rule": "R7",
            "decision": "allow" if ok else ("hold" if result["result"] == "error" else "deny"),
            "reason": (f"Enrollment: CRS identity clean for the holder of {masked}{sim}; waiting for Maya to attest" if ok
                       else f"Enrollment refused: CRS {result['result']} for the holder of {masked}{sim}"),
        }]
        stamped = await state.append_audit(s, run_id, events, None, policy.policy_digest())
        await s.commit()
    state.publish(stamped)
    return {"supplier_id": supplier_id, "status": "pending_attestation" if ok else "refused", "crs": result,
            "events": stamped}


@app.post("/api/suppliers/{supplier_id}/attest", tags=["suppliers"])
async def attest_supplier(supplier_id: str, body: schemas.AttestIn):
    async with state.lock, session() as s:
        row = (await s.execute(select(SupplierRow).where(SupplierRow.id == supplier_id))).scalar_one_or_none()
        if row is None or row.status != "pending_attestation":
            fail(404, f"{supplier_id} isn't waiting for attestation.")
        row.status = "active" if body.approve else "refused"
        row.attested_by = body.approver
        verdict = "attested" if body.approve else "refused"
        events = [{
            "node": "maya", "edge": ["gate", "maya"], "layer": "user_interface", "mechanism": "human_in_loop",
            "decision": "allow" if body.approve else "deny",
            "reason": f"{body.approver} {verdict} {row.name} {row.account_masked} on the Sudibran card",
        }]
        out: dict = {}
        if body.approve:
            # The supplier's bank account on the rail. Opened by the broker (the only Nessie key holder).
            try:
                row.nessie_account_id = await broker_client.open_payee_account(row.name)
                out["nessie_account"] = row.nessie_account_id or "simulated"
            except broker_client.BrokerError as e:
                out["nessie_account"] = f"not opened ({e}); payments to this supplier will be held until it is"
            # The supplier's own agent: registered with its own signing secret, shown once.
            if row.agent_id:
                secret = secrets.token_urlsafe(32)
                s.add(AgentKey(agent_id=row.agent_id, supplier_id=row.id, secret=secret, created_at=now()))
                s.add(ComponentRow(
                    id=row.agent_id, type="agent", name=f"{row.name} seller agent",
                    description=f"{row.name}'s own AI agent. Sends invoices with a signed action report.",
                    fingerprint=sha256_hex(secret)[:8], status="verified",
                ))
                out["agent"] = {"agent_id": row.agent_id, "signing_secret": secret,
                                "note": "Shown once. The agent signs each action report with it (HMAC-SHA256)."}
                events.append({
                    "node": "seller", "edge": ["seller", "gate"], "layer": "other_agents", "mechanism": "identity",
                    "decision": "allow", "reason": f"{row.agent_id} registered for {row.name}; its reports must be signed",
                })
        stamped = await state.append_audit(s, f"enroll-{supplier_id}", events, None)
        await state.say(s, "sudibran", f"{row.name} {row.account_masked}: {verdict} by {body.approver}.")
        await s.commit()
    state.publish(stamped)
    return {"supplier": state.supplier_dict(row) | {"status": row.status}, **out, "events": stamped}


# ───────────────────────── demo admin ─────────────────────────


@app.post("/api/admin/nessie/sync", tags=["admin"])
async def nessie_sync():
    """Nessie's reported balances next to Sudibran's ledger. Reports only: the sandbox records
    withdrawals and deposits but never applies them to balances, so overwriting would reset them."""
    live_balances = await nessie.balances()
    if live_balances is None:
        fail(409, "Nessie isn't configured (NESSIE_API_KEY and data/nessie.json), so balances are simulated.")
    async with session() as s:
        ledger = await state.balances(s)
    return {"nessie_reported": live_balances, "sudibran_ledger": ledger,
            "note": "The Nessie sandbox doesn't apply transactions to balances; the dashboard uses the ledger."}


@app.get("/api/tools", tags=["admin"])
async def list_tools():
    async with session() as s:
        pins = (await s.execute(select(ToolPin))).scalars().all()
    return [{"name": p.name, "description": p.description, "pinned_fingerprint": p.pinned_fingerprint,
             "current_fingerprint": p.current_fingerprint, "status": p.status, "reviewer": p.reviewer,
             "pinned_at": p.pinned_at} for p in pins]


@app.post("/api/admin/tools/{name}/description", tags=["admin"])
async def change_tool_description(name: str, body: schemas.ToolDescriptionIn):
    """Demo the rug-pull (A6) for real: change a tool's description after it was approved.
    The next call through the proxy, or the next live run, finds the fingerprint mismatch."""
    spec = tools.SPEC_BY_NAME.get(name)
    if spec is None:
        fail(404, f"No tool called {name}.")
    async with state.lock, session() as s:
        pin = await s.get(ToolPin, name)
        pin.description = body.description
        pin.current_fingerprint = tools.tool_fingerprint(spec, body.description)
        await s.commit()
        return {"name": name, "pinned_fingerprint": pin.pinned_fingerprint, "current_fingerprint": pin.current_fingerprint}


@app.post("/api/admin/tools/{name}/repin", tags=["admin"])
async def repin_tool(name: str):
    """Maya reviews the tool's new description and approves it."""
    async with state.lock, session() as s:
        pin = await s.get(ToolPin, name)
        if pin is None:
            fail(404, f"No tool called {name}.")
        pin.pinned_fingerprint, pin.status, pin.reviewer, pin.pinned_at = pin.current_fingerprint, "verified", "maya", now()
        await s.commit()
        return {"name": name, "fingerprint": pin.pinned_fingerprint, "status": pin.status}


# ───────────────────────── internal: proxy and Droid's hook ─────────────────────────


def internal_only(x_internal_token: str = Header(default="")) -> None:
    expected = get_settings().internal_token
    if not expected or x_internal_token != expected:
        fail(401, "internal callers only")


@app.post("/internal/agent-tools/{name}", dependencies=[Depends(internal_only)], include_in_schema=False)
async def internal_agent_tool(name: str, args: dict):
    try:
        # Checked here, not trusted from the proxy: registered tool, unchanged fingerprint, active run.
        verdict = await proxy.gate_check(name, args, via="proxy")
        if verdict["decision"] != "allow":
            raise tools.ToolError(verdict["reason"])
        return await tools.call_tool(name, args)
    except (proxy.ToolQuarantined, tools.ToolError) as e:
        fail(403, str(e))


@app.post("/internal/hooks/pre-tool-use", dependencies=[Depends(internal_only)], include_in_schema=False)
async def pre_tool_use(body: schemas.HookIn):
    """Droid's PreToolUse hook (CLI path) asks here first. The SDK path asks the same function
    in-process. Hooks fail open, so the proxy's fingerprint check and the broker's token stay
    the hard stops."""
    return await proxy.gate_check(body.tool_name, body.tool_input or {}, via="hook")
