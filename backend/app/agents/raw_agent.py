"""agent-raw: the same agent with no Sudibran. Demo control group only.

It reads the untrusted text directly and pays straight from Maya's raw-side account, with no
policy, no token and no audit. Keep it honest: a strawmanned baseline would make the
comparison worthless. In compose it's its own service with its own Nessie access, on a
network the protected agent can't reach.
    uvicorn app.agents.raw_agent:app --port 8004"""

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

from app.config import get_settings
from app.integrations import nessie


async def pay(to_masked: str, amount: float, description: str) -> dict:
    raw_url = get_settings().raw_agent_url
    if raw_url:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(f"{raw_url.rstrip('/')}/pay", json={"to": to_masked, "amount": amount,
                                                                       "description": description})
            r.raise_for_status()
            return r.json()
    try:
        return await nessie.pay("maya_raw", to_masked, amount, description)
    except nessie.NessieError as e:
        return {"rail": "nessie", "status": "failed", "error": str(e)[:200]}


class PayIn(BaseModel):
    to: str
    amount: float
    description: str


app = FastAPI(title="agent-raw (no Sudibran)", docs_url=None, redoc_url=None)


@app.post("/pay")
async def http_pay(body: PayIn) -> dict:
    return await pay(body.to, body.amount, body.description)
