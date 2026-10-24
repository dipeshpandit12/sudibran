"""mcp-proxy: the MCP server Droid connects to, and the only tools it can see.

Every call is checked before it runs:
  1. the tool's current description must match the fingerprint pinned at registration (A6: a
     tool whose description changes after approval is quarantined, and its calls refused);
  2. the call is forwarded to the gate (in-process locally, over HTTP in compose), where the
     tool records proposals; nothing here moves money.

Register with Droid once:
    droid mcp add sudibran http://localhost:8000/mcp --type http --no-oauth"""

import re
from contextlib import asynccontextmanager

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError as McpToolError
from mcp.server.transport_security import TransportSecuritySettings
from starlette.routing import Route

from app.agents import tools
from app.config import get_settings
from app.db import ToolPin, session

INSTRUCTIONS = (
    "Sudibran accounts-payable tools. You see typed invoice fields only. Payments are proposals: "
    "Sudibran checks each one against Maya's signed intent and policy before anything moves."
)


class ToolQuarantined(Exception):
    pass


async def check_pin(name: str) -> None:
    async with session() as s:
        pin = await s.get(ToolPin, name)
    if pin is None:
        raise ToolQuarantined(f"{name} isn't a registered tool")
    if pin.status == "quarantined" or pin.current_fingerprint != pin.pinned_fingerprint:
        raise ToolQuarantined(f"{name} is quarantined: its description changed after it was approved "
                              f"({pin.pinned_fingerprint} ≠ {pin.current_fingerprint})")


async def gate_check(tool_name: str, tool_input: dict, via: str) -> dict:
    """May the agent make this tool call? Only Sudibran's registered tools, with an unchanged
    fingerprint, inside an active run. Shared by Droid's permission callback (SDK) and its
    PreToolUse hook (CLI). Every decision is noted on the run for the plan view."""
    tool = re.split(r"___|__|/|:", tool_name)[-1]  # Droid names MCP tools "sudibran___<tool>"
    run_id = (tool_input or {}).get("run_id")

    # Tools without a run_id (lookup_supplier, verify_payee) belong to the one active run: the
    # gate serialises runs, so there is never more than one.
    owner = run_id if run_id in tools.ACTIVE else (next(iter(tools.ACTIVE)) if len(tools.ACTIVE) == 1 else None)

    def note(decision: str, reason: str) -> dict:
        if owner is not None:
            tools.ACTIVE[owner].calls.append(
                {"tool": "permission", "args": {"tool": tool_name, "decision": decision, "via": via, "reason": reason}}
            )
        return {"decision": decision, "reason": reason}

    if tool not in tools.SPEC_BY_NAME:
        return note("deny", f"Only Sudibran's MCP tools are allowed; {tool_name} isn't one.")
    try:
        await check_pin(tool)
    except ToolQuarantined as e:
        return note("deny", str(e))
    if "run_id" in tools.SPEC_BY_NAME[tool]["input_schema"]["properties"] and run_id not in tools.ACTIVE:
        return note("deny", f"No active Sudibran run {run_id}.")
    return note("allow", "Registered tool, fingerprint matches, active run.")


async def guarded(name: str, args: dict) -> dict:
    """Refusals are raised as MCP ToolErrors so the agent sees the reason (and so does the
    "plans, steps, results" view), instead of a generic tool crash."""
    try:
        s = get_settings()
        if not s.proxy_forward:  # forwarded calls are checked by the gate, which owns the database
            verdict = await gate_check(name, args, via="proxy")
            if verdict["decision"] != "allow":
                raise tools.ToolError(verdict["reason"])
        if s.proxy_forward:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(f"{s.gate_url.rstrip('/')}/internal/agent-tools/{name}", json=args,
                                      headers={"x-internal-token": s.internal_token})
            if r.status_code != 200:
                raise tools.ToolError(r.json().get("error", r.text[:300]) if r.headers.get(
                    "content-type", "").startswith("application/json") else r.text[:300])
            return r.json()
        return await tools.call_tool(name, args)
    except (ToolQuarantined, tools.ToolError) as e:
        raise McpToolError(f"Sudibran refused: {e}") from e


def build() -> MCPServer:
    server = MCPServer(name="sudibran", instructions=INSTRUCTIONS)
    spec = tools.SPEC_BY_NAME

    @server.tool(name="get_invoice_fields", description=spec["get_invoice_fields"]["description"])
    async def get_invoice_fields(run_id: str) -> dict:
        return await guarded("get_invoice_fields", {"run_id": run_id})

    @server.tool(name="lookup_supplier", description=spec["lookup_supplier"]["description"])
    async def lookup_supplier(name: str) -> dict:
        return await guarded("lookup_supplier", {"name": name})

    @server.tool(name="verify_payee", description=spec["verify_payee"]["description"])
    async def verify_payee(supplier_name: str) -> dict:
        return await guarded("verify_payee", {"supplier_name": supplier_name})

    @server.tool(name="propose_payment", description=spec["propose_payment"]["description"])
    async def propose_payment(run_id: str, supplier_name: str, invoice_id: str, amount_usd: float) -> dict:
        return await guarded("propose_payment", {"run_id": run_id, "supplier_name": supplier_name,
                                                 "invoice_id": invoice_id, "amount_usd": amount_usd})

    @server.tool(name="remember", description=spec["remember"]["description"])
    async def remember(run_id: str, key: str, value: str) -> dict:
        return await guarded("remember", {"run_id": run_id, "key": key, "value": value})

    @server.tool(name="send_message", description=spec["send_message"]["description"])
    async def send_message(run_id: str, to: str, body: str) -> dict:
        return await guarded("send_message", {"run_id": run_id, "to": to, "body": body})

    return server


def transport_security() -> TransportSecuritySettings:
    hosts = [h.strip() for h in get_settings().mcp_allowed_hosts.split(",") if h.strip()]
    return TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=hosts)


class McpEndpoint:
    """ASGI endpoint for /mcp. MCP's session manager can only run once per instance, so each app
    start builds a fresh server: `async with endpoint.running():` in the host app's lifespan."""

    def __init__(self):
        self._asgi = None

    async def __call__(self, scope, receive, send):
        if self._asgi is None:
            await send({"type": "http.response.start", "status": 503, "headers": [(b"content-type", b"text/plain")]})
            await send({"type": "http.response.body", "body": b"MCP server not started"})
            return
        await self._asgi(scope, receive, send)

    @asynccontextmanager
    async def running(self):
        server = build()
        app = server.streamable_http_app(
            streamable_http_path="/mcp", stateless_http=True, json_response=True,
            transport_security=transport_security(),
        )
        self._asgi = next(r.endpoint for r in app.routes if getattr(r, "path", None) == "/mcp")
        try:
            async with server.session_manager.run():
                yield
        finally:
            self._asgi = None


def route(endpoint: McpEndpoint) -> Route:
    return Route("/mcp", endpoint=endpoint)
