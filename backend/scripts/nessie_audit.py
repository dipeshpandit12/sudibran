"""Proof from the bank's side (Capital One track: "a real transfer completing, and a blocked one
that never reaches Nessie"). Lists every deposit Nessie holds for each payee account and which
of Maya's accounts it came from: the protected one (through Sudibran) or the raw one (no Sudibran).

    uv run python scripts/nessie_audit.py

Reads Nessie directly; nothing here trusts Sudibran's own records."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.db import SupplierRow, session
from app.integrations import nessie


async def main() -> None:
    client = nessie.client()
    if client is None:
        sys.exit("Nessie isn't configured: set NESSIE_API_KEY and run scripts/nessie_seed.py first.")
    m = nessie.accounts_map()
    sources = {}
    for role, label in (("maya_protected", "Maya PROTECTED (via Sudibran)"), ("maya_raw", "Maya RAW (no Sudibran)")):
        for w in await client._request("GET", f"/accounts/{m[role]}/withdrawals"):
            sources[w["_id"]] = label
    payees = {f"{masked}": acct for masked, acct in m["by_masked"].items()}
    try:  # suppliers enrolled later have their own Nessie account on record
        async with session() as s:
            for row in (await s.execute(select(SupplierRow))).scalars().all():
                if row.nessie_account_id:
                    payees[f"{row.account_masked} {row.name}"] = row.nessie_account_id
    except Exception:
        print("(no Sudibran database yet: showing the seeded accounts only)")
    for label, acct in payees.items():
        deposits = await client._request("GET", f"/accounts/{acct}/deposits")
        print(f"\n{label}: {len(deposits)} deposit(s)")
        for d in deposits:
            src = next((v for k, v in sources.items() if k in d.get("description", "")), "unknown source")
            print(f"   ${d['amount']:<6} {d['transaction_date']}  from {src}  ·  {d['description'][:70]}")


if __name__ == "__main__":
    asyncio.run(main())
