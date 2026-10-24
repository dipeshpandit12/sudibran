"""mcp-proxy as its own service (compose): the agent's only network neighbour.
It forwards tool calls to the gate (PROXY_FORWARD=true), which checks each tool's pinned
fingerprint and runs it. The proxy has no database, no bank key and no broker token.
    uvicorn app.proxy.service:app --port 8002"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.proxy.server import McpEndpoint, route

endpoint = McpEndpoint()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with endpoint.running():
        yield


app = FastAPI(title="Sudibran MCP proxy", docs_url=None, redoc_url=None, lifespan=lifespan)
app.router.routes.append(route(endpoint))


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
