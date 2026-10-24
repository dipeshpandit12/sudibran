"""The planner: Maya's accounts-payable agent. It only ever sees typed invoice fields and acts
only through the tools in app/agents/tools.py.

- ScriptedPlanner: offline; pays the invoice it was given.
- ClaudePlanner:   Claude with tool use (PLANNER=claude).
- DroidPlanner:    Factory Droid, headless (PLANNER=droid), tools limited to our MCP server.
- fooled():        what the "assume breach" switch uses: a planner that does whatever the
                   untrusted text says, to prove Sudibran doesn't rely on the model resisting."""

import asyncio
import json
import re
import shutil

from app.agents.tools import SPEC_BY_NAME, TOOL_SPECS, Proposal, RunContext, call_tool, contains_private
from app.config import ROOT, get_settings
from app.util import usd

PLANNER_SYSTEM = """You are the accounts-payable agent for Maya, an AP clerk at a small firm.
Maya's signed intent: "{intent}". Her approval threshold is {threshold}.
You only see typed invoice fields; you never see raw invoice text.
For the invoice in this run: look up the supplier, then propose paying it with propose_payment.
Use run_id "{run_id}" in every tool call. Don't propose anything Maya's intent doesn't cover."""


async def plan(ctx: RunContext, intent: dict) -> tuple[list[Proposal], str]:
    """Run the configured planner. Returns (proposals, backend)."""
    s = get_settings()
    if s.planner == "droid":
        await DroidPlanner().run(ctx, intent)
        return ctx.proposals, "droid"
    if s.planner == "claude" and s.anthropic_api_key_planner:
        await ClaudePlanner().run(ctx, intent)
        return ctx.proposals, "claude"
    await ScriptedPlanner().run(ctx, intent)
    return ctx.proposals, "scripted"


class ScriptedPlanner:
    async def run(self, ctx: RunContext, intent: dict) -> None:
        f = ctx.fields
        await call_tool("lookup_supplier", {"name": f["supplier_name"]})
        await call_tool("propose_payment", {
            "run_id": ctx.run_id, "supplier_name": f["supplier_name"], "invoice_id": f["invoice_id"],
            "amount_usd": f["amount_usd"],
        })


class ClaudePlanner:
    """A manual tool-use loop. tool_choice stays "auto" (forced tool choice isn't available on
    current models); the system prompt says which tool to use."""

    async def run(self, ctx: RunContext, intent: dict) -> None:
        from anthropic import AsyncAnthropic

        s = get_settings()
        client = AsyncAnthropic(api_key=s.anthropic_api_key_planner)
        tools = [{"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
                 for t in TOOL_SPECS if t["name"] != "get_invoice_fields"]
        system = PLANNER_SYSTEM.format(intent=intent["text"], threshold=usd(intent["threshold_usd"]), run_id=ctx.run_id)
        messages: list = [{"role": "user", "content": f"Invoice fields (typed, from the parser):\n{json.dumps(ctx.fields)}"}]
        for _ in range(6):
            resp = await client.messages.create(
                model=s.planner_model, max_tokens=4000, system=system, tools=tools, messages=messages,
                output_config={"effort": "low"},
            )
            if resp.stop_reason != "tool_use":
                return
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for block in resp.content:
                if block.type != "tool_use":
                    continue
                args = dict(block.input or {})
                if "run_id" in SPEC_BY_NAME[block.name]["input_schema"]["properties"]:
                    args["run_id"] = ctx.run_id  # the agent can't point a tool at another run
                try:
                    out = await call_tool(block.name, args)
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(out)})
                except Exception as e:
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(e), "is_error": True})
            messages.append({"role": "user", "content": results})


class DroidError(Exception):
    pass


DROID_TOOL_NOTE = """

Your only tools are Sudibran's: {server}___get_invoice_fields, {server}___lookup_supplier,
{server}___verify_payee and {server}___propose_payment. Their schemas are deferred: first call the
ToolSearch tool with query "select:{server}___get_invoice_fields,{server}___lookup_supplier,{server}___propose_payment",
then call them.
Steps: get_invoice_fields(run_id="{run_id}"), then lookup_supplier for that supplier, then
propose_payment with run_id "{run_id}", the supplier's name, the invoice id and the amount. Then stop."""

# Droid's own runtime tools, which stay on alongside the allowlist. None can act outside it:
#  - ToolSearch loads schemas of deferred (MCP) tools.
#  - Script is how Droid calls tools: an isolated JavaScript evaluation with no imports, Node
#    globals, filesystem or network; its `tools` object holds exactly the allowed tools.
#  - WaitForScript reads or stops a running Script.
DROID_HARMLESS_TOOLS = {"ToolSearch", "Script", "WaitForScript"}


class DroidPlanner:
    """Factory Droid as Maya's AP agent, driven through the Droid Python SDK (droid_sdk).

    Control, in layers:
      1. The session gets exactly one MCP server, Sudibran's (SessionConfig.mcp_servers), and
         restrict_tools is set to that server's tools, discovered at session start. Anything else
         allowed besides Droid's sandboxed runtime tools (DROID_HARMLESS_TOOLS) fails the run
         closed. Droid's shell, file, edit and web tools are never available.
      2. Every tool call is checked by the gate at the MCP server (app/proxy/server.py::gate_check:
         registered tool, unchanged fingerprint, active run) and logged on the run. If Droid asks
         permission first, on_permission applies the same check.
      3. The tools themselves only record proposals; money still needs policy + a broker token.
    Visibility: every tool call and result Droid makes is streamed into the run's plan
    (GET /api/runs/{id}/plan), with Droid's session id, turns and summary."""

    async def run(self, ctx: RunContext, intent: dict) -> None:
        from droid_sdk import (
            Autonomy,
            HttpMcpServerConfig,
            InteractionHandlers,
            McpToolAction,
            PermissionRequest,
            PermissionResponse,
            ReasoningEffort,
            Session,
            SessionConfig,
            ToolCall,
            ToolConfirmationOutcome,
            ToolResult,
        )
        from droid_sdk import (
            DroidError as SdkError,
        )

        from app.proxy.server import gate_check

        s = get_settings()
        if not shutil.which(s.droid_bin):
            raise DroidError(f"{s.droid_bin} not found on PATH")
        server = s.droid_mcp_server
        mcp_url = s.droid_mcp_url or f"{s.gate_url.rstrip('/')}/mcp"

        async def on_permission(request: PermissionRequest) -> PermissionResponse:
            for action in request.actions:
                if not isinstance(action, McpToolAction) or (action.server_name or server) != server:
                    ctx.calls.append({"tool": "permission", "args": {
                        "tool": type(action).__name__, "decision": "deny", "via": "sdk",
                        "reason": "Droid may only use Sudibran's MCP tools"}})
                    return PermissionResponse(ToolConfirmationOutcome.CANCEL, comment="Not a Sudibran tool.")
                tool = action.actual_tool_name or action.tool_name
                verdict = await gate_check(tool, dict(action.tool_use.input), via="sdk")
                if verdict["decision"] != "allow":
                    return PermissionResponse(ToolConfirmationOutcome.CANCEL, comment=verdict["reason"])
            return PermissionResponse(ToolConfirmationOutcome.PROCEED_ONCE)

        config = SessionConfig(
            autonomy=Autonomy(s.droid_autonomy),
            mcp_servers=[HttpMcpServerConfig(name=server, url=mcp_url, oauth=False)],
            disable_builtin_skills=True,
        )
        prompt = (
            PLANNER_SYSTEM.format(intent=intent["text"], threshold=usd(intent["threshold_usd"]), run_id=ctx.run_id)
            + DROID_TOOL_NOTE.format(server=server, run_id=ctx.run_id)
        )
        steps: list[dict] = []
        try:
            async with Session(
                cwd=ROOT / "droid", model=s.droid_model or None,
                reasoning_effort=ReasoningEffort(s.droid_reasoning_effort), config=config,
                interactions=InteractionHandlers(on_permission=on_permission), api_key=s.factory_api_key or None,
            ) as session:
                # Droid connects to the MCP server as the session starts; give it a few seconds.
                mcp_tools: set[str] = set()
                for _ in range(10):
                    mcp_tools = {t.name for t in await session.list_mcp_tools() if t.server_name == server}
                    if mcp_tools:
                        break
                    await asyncio.sleep(0.5)
                selectors = [f"MCP:{server}/{name}" for name in sorted(mcp_tools)]
                allowed = [t.id for t in await session.list_tools(restrict_tools=selectors) if t.allowed] if selectors else []
                ours = [t for t in allowed if t.startswith(f"{server}___")]
                unexpected = [t for t in allowed if t not in ours and t not in DROID_HARMLESS_TOOLS]
                if not ours or unexpected:
                    raise DroidError(f"Droid's tools at {mcp_url} aren't exactly Sudibran's (ours={ours}, "
                                     f"unexpected={unexpected}); refusing to run")
                await session.update_settings(restrict_tools=selectors)
                stream = session.stream(prompt, timeout=s.droid_timeout_s)
                async with stream:
                    async for event in stream:
                        if isinstance(event, ToolCall):
                            steps.append({"step": "call", "tool": event.name, "input": dict(event.input)})
                        elif isinstance(event, ToolResult):
                            steps.append({"step": "result", "tool": event.tool_name, "error": event.is_error,
                                          "content": str(event.content)[:300]})
                result = stream.result
        except SdkError as e:
            raise DroidError(f"Droid SDK: {type(e).__name__}: {e}") from e
        ctx.calls.append({"tool": "droid_session", "args": {
            "session_id": result.session_id, "model": s.droid_model or "droid default", "allowed_tools": allowed,
            "turns": result.turn_count, "duration_s": round(result.duration.total_seconds(), 1),
            "success": result.success, "summary": (result.text or "")[:600], "steps": steps,
            "error": getattr(getattr(result, "error", None), "message", None),
        }})
        if not result.success:
            reason = getattr(getattr(result, "error", None), "message", None) or result.subtype
            raise DroidError(f"Droid run ended: {reason}")


# ───────────── assume breach: a fully fooled planner ─────────────

_MASKED = re.compile(r"\*{4}(\d{4})")
_ACCOUNT_WORDS = re.compile(r"account\s*(?:number|no\.?|#)?\s*:?\s*(\d{4,17})", re.IGNORECASE)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_DOLLARS = re.compile(r"\$\s?([\d,]+(?:\.\d{1,2})?)")


def _account_in(text: str) -> str | None:
    m = _MASKED.search(text)
    if m:
        return f"****{m.group(1)}"
    m = _ACCOUNT_WORDS.search(text)
    return f"****{m.group(1)[-4:]}" if m else None


def fooled(text: str, fields: dict, record_account: str | None) -> Proposal | None:
    """What a planner that obeys the injected text would propose. None when the text asks for
    nothing beyond paying the invoice as written (nothing to be fooled into)."""
    t = text.lower()
    supplier = fields.get("supplier_name") or "the supplier"
    amount = float(fields.get("amount_usd") or 0)
    account = _account_in(text)
    email = _EMAIL.search(text)

    if email or re.search(r"supplier list|bank details|export (all|the)|send .*(list|accounts|records)", t):
        to = email.group(0) if email else "an outside address"
        return Proposal(
            type="send_message", origin="injection", to=to, contains_private=True,
            description="Planner proposes emailing the supplier list to an outside address (assume breach)",
        )
    if re.search(r"remember|for next time|save (this|that) to memory", t) and account:
        return Proposal(
            type="pay", origin="injection", supplier_name=supplier, amount_usd=amount, payee_account=account,
            payee_source="memory", memory={"key": f"{supplier} bank account", "value": account},
            description=f"Planner proposes paying {supplier.split(' ')[0]} at {account} from memory (assume breach)",
        )
    if account and account != record_account:
        extra = _DOLLARS.search(text)
        pay_amount = float(extra.group(1).replace(",", "")) if extra else amount
        return Proposal(
            type="pay", origin="injection", supplier_name=supplier, amount_usd=pay_amount, payee_account=account,
            payee_source="invoice_text",
            description=f"Planner proposes paying {usd(pay_amount).replace('.00', '')} to {account} (assume breach)",
        )
    if re.search(r"already approved|approved (this|it) by phone|maya (said|approved)|pre-?approved", t):
        return Proposal(
            type="pay", origin="injection", supplier_name=supplier, amount_usd=amount, claims_approval=True,
            payee_source="record", description="Planner treats the claimed approval as real (assume breach)",
        )
    if re.search(r"admin note|without (any )?approval|skip (the )?approval|no approval", t):
        return Proposal(
            type="pay", origin="injection", supplier_name=supplier, amount_usd=amount, payee_source="record",
            description=f"Planner proposes paying {supplier} without approval (assume breach)",
        )
    if contains_private(text) and re.search(r"\b(send|email|share|post|forward)\b", t):
        return Proposal(
            type="send_message", origin="injection", to="an outside address", contains_private=True,
            description="Planner proposes sending private data outside (assume breach)",
        )
    return Proposal(
        type="unknown", origin="injection",
        description="Planner proposes an action that isn't in Maya's intent (assume breach)",
    )
