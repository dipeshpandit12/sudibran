"""Capital One Nessie (sandbox bank). Only the broker/payment process imports this,
because only it holds NESSIE_API_KEY.

What the live sandbox (https://api.nessieisreal.com) actually does, verified 2026-10-24:
- POST /accounts/{id}/transfers takes no payee at all (just amount, date, status, description),
  so it can't express "pay this supplier". We don't use it.
- A payment is therefore two real records: a withdrawal from the payer's account and a deposit
  to the payee's account, each with its own Nessie id, cross-referenced in their descriptions.
- Amounts must be whole dollars. Cents are rounded on the Nessie record; the exact amount is in
  the description.
- The sandbox records transactions but never applies them to account balances, so balances
  shown by Sudibran come from its own ledger. /api/admin/nessie/sync reports Nessie's figures."""

import json
import uuid
from datetime import date
from pathlib import Path

import httpx

from app.config import get_settings


class NessieError(Exception):
    pass


class NessieClient:
    def __init__(self, api_key: str, base_url: str):
        self.key = api_key
        self.base = base_url.rstrip("/")

    async def _request(self, method: str, path: str, body: dict | None = None) -> dict | list:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.request(method, f"{self.base}{path}", params={"key": self.key}, json=body)
        if r.status_code >= 400:
            raise NessieError(f"Nessie {method} {path} → {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else {}  # some DELETEs return an empty body

    async def create_customer(self, first: str, last: str) -> str:
        body = {
            "first_name": first,
            "last_name": last,
            "address": {"street_number": "3601", "street_name": "Lyon St", "city": "San Francisco", "state": "CA", "zip": "94123"},
        }
        data = await self._request("POST", "/customers", body)
        return _created_id(data)

    async def create_account(self, customer_id: str, nickname: str, balance: float) -> str:
        body = {"type": "Checking", "nickname": nickname, "rewards": 0, "balance": int(balance)}
        data = await self._request("POST", f"/customers/{customer_id}/accounts", body)
        return _created_id(data)

    async def account(self, account_id: str) -> dict:
        data = await self._request("GET", f"/accounts/{account_id}")
        assert isinstance(data, dict)
        return data

    async def transfer(self, payer_id: str, payee_id: str, amount: float, description: str) -> dict:
        """Withdrawal from the payer + deposit to the payee: the only two-sided movement this
        sandbox can record. Returns both ids; transfer_id is the withdrawal's."""
        whole = max(1, round(amount))
        exact = f"${amount:,.2f}"
        today = date.today().isoformat()
        # Every documented field, or the sandbox can't list the record back later.
        withdrawal = await self._request("POST", f"/accounts/{payer_id}/withdrawals", {
            "medium": "balance", "amount": whole, "transaction_date": today, "status": "completed",
            "description": f"{description} · {exact}"[:100],
        })
        withdrawal_id = _created_id(withdrawal)
        deposit = await self._request("POST", f"/accounts/{payee_id}/deposits", {
            "medium": "balance", "amount": whole, "transaction_date": today,
            "status": "completed", "description": f"{description} · {exact} · withdrawal {withdrawal_id}"[:100],
        })
        return {"transfer_id": withdrawal_id, "deposit_id": _created_id(deposit), "status": "completed",
                "amount_recorded": whole, "amount_exact": round(amount, 2)}


def _created_id(data) -> str:
    obj = data.get("objectCreated", data) if isinstance(data, dict) else {}
    if not obj.get("_id"):
        raise NessieError(f"Nessie didn't return an id: {data}")
    return obj["_id"]


def accounts_map() -> dict:
    """data/nessie.json, written by scripts/nessie_seed.py:
    {"maya_protected": id, "maya_raw": id, "by_masked": {"****1234": id, ...}}"""
    path = Path(get_settings().nessie_accounts_file)
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def client() -> NessieClient | None:
    s = get_settings()
    if not s.nessie_api_key or not accounts_map():
        return None
    return NessieClient(s.nessie_api_key, s.nessie_base_url)


def mode() -> str:
    return "live" if client() else "simulated"


async def pay(from_role: str, to_masked: str, amount: float, description: str, payee_id: str | None = None) -> dict:
    """Move money from Maya's account (protected side or raw side) to a supplier's Nessie account
    (payee_id, from the supplier record) or, for seeded accounts, by masked number.
    Simulated when Nessie isn't configured; the result always says which."""
    nessie = client()
    if nessie is None:
        return {"rail": "simulated", "transfer_id": f"sim-{uuid.uuid4().hex[:10]}", "status": "executed"}
    m = accounts_map()
    payer = m.get(from_role)
    payee = payee_id or (m.get("by_masked") or {}).get(to_masked)
    if not payer or not payee:
        raise NessieError(f"no Nessie account mapped for {from_role} → {to_masked}; rerun scripts/nessie_seed.py")
    out = await nessie.transfer(payer, payee, amount, description)
    return {"rail": "nessie", **out}


async def balances() -> dict | None:
    """Live balances for both of Maya's accounts, or None when simulated."""
    nessie = client()
    if nessie is None:
        return None
    m = accounts_map()
    out = {}
    for side, role in (("raw", "maya_raw"), ("protected", "maya_protected")):
        acct = await nessie.account(m[role])
        out[side] = float(acct.get("balance", 0))
    return out


async def open_payee_account(name: str) -> str | None:
    """A Nessie customer + checking account for a newly attested supplier. None when simulated."""
    nessie = client()
    if nessie is None:
        return None
    words = name.split()
    customer = await nessie.create_customer(words[0], " ".join(words[1:]) or "Supplier")
    return await nessie.create_account(customer, name[:40], 0)
