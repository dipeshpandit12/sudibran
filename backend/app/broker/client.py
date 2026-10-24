"""How the gate reaches the broker: in-process for local dev, HTTP when BROKER_URL is set
(compose). Same calls either way, so splitting the service changes nothing else."""

import httpx

from app.broker import service
from app.config import get_settings


class BrokerError(Exception):
    pass


def _http() -> tuple[str, dict] | None:
    s = get_settings()
    if not s.broker_url:
        return None
    return s.broker_url.rstrip("/"), {"x-internal-token": s.broker_token}


async def mint(run_id: str, tool: str, args: dict, decision_seq: int | None = None) -> dict:
    remote = _http()
    if remote is None:
        return await service.mint(run_id, tool, args, decision_seq)
    base, headers = remote
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(f"{base}/mint", json={"run_id": run_id, "tool": tool, "args": args,
                                                      "decision_seq": decision_seq}, headers=headers)
    if r.status_code != 200:
        raise BrokerError(f"broker refused to mint: {r.text[:200]}")
    return r.json()


async def pay(token: str, args: dict) -> dict:
    remote = _http()
    if remote is None:
        try:
            return await service.pay(token, args)
        except service.PaymentRefused as e:
            raise BrokerError(str(e)) from e
    base, headers = remote
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(f"{base}/pay", json={"token": token, "args": args}, headers=headers)
    if r.status_code != 200:
        raise BrokerError(r.json().get("detail", r.text[:200]) if r.headers.get("content-type", "").startswith(
            "application/json") else r.text[:200])
    return r.json()


async def open_payee_account(name: str) -> str | None:
    remote = _http()
    if remote is None:
        try:
            return await service.open_payee_account(name)
        except Exception as e:
            raise BrokerError(f"couldn't open a Nessie account: {e}") from e
    base, headers = remote
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(f"{base}/accounts", json={"name": name}, headers=headers)
    if r.status_code != 200:
        raise BrokerError(f"couldn't open a Nessie account: {r.text[:200]}")
    return r.json().get("nessie_account_id")
