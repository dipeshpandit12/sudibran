"""Live Nessie check (opt-in, it creates real sandbox records):

    NESSIE_LIVE=1 uv run pytest tests/test_nessie.py     # reads NESSIE_API_KEY from .env

A payment must leave a withdrawal on the payer's account and a matching deposit on the payee's."""

import asyncio
import os

import pytest


@pytest.mark.skipif(not os.environ.get("NESSIE_LIVE"), reason="set NESSIE_LIVE=1 to call the Nessie sandbox")
def test_payment_leaves_both_records(monkeypatch):
    from app.config import ROOT, get_settings
    from app.integrations import nessie

    env = ROOT / ".env"
    for line in env.read_text().splitlines() if env.exists() else []:
        key, _, value = line.partition("=")
        if key.startswith("NESSIE_") and value:
            monkeypatch.setenv(key, value)
    monkeypatch.setenv("NESSIE_ACCOUNTS_FILE", str(ROOT / "data" / "nessie.json"))
    get_settings.cache_clear()
    try:
        client = nessie.client()
        assert client is not None, "NESSIE_API_KEY or data/nessie.json missing"
        m = nessie.accounts_map()

        async def run():
            out = await nessie.pay("maya_protected", "****1234", 1.0, "pytest live check")
            withdrawals = await client._request("GET", f"/accounts/{m['maya_protected']}/withdrawals")
            deposits = await client._request("GET", f"/accounts/{m['by_masked']['****1234']}/deposits")
            # tidy the sandbox: single-record routes are singular for withdrawals
            await client._request("DELETE", f"/withdrawal/{out['transfer_id']}")
            await client._request("DELETE", f"/deposits/{out['deposit_id']}")
            return out, withdrawals, deposits

        out, withdrawals, deposits = asyncio.run(run())
        assert out["rail"] == "nessie"
        assert any(w["_id"] == out["transfer_id"] for w in withdrawals)
        assert any(d["_id"] == out["deposit_id"] and out["transfer_id"] in d["description"] for d in deposits)
    finally:
        get_settings.cache_clear()
