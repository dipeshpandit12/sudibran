"""Hour-one check: one real $1 sandbox payment from Maya's protected account to Acme, then read
both records back from Nessie. Run after nessie_seed.py.

    uv run python scripts/nessie_transfer.py

A payment is a withdrawal from Maya's account plus a deposit to Acme's, because this sandbox's
/transfers endpoint takes no payee. The sandbox doesn't apply transactions to balances, so the
check is that both records exist on the right accounts, not that balances moved."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.integrations import nessie


async def main() -> None:
    client = nessie.client()
    if client is None:
        sys.exit("Nessie isn't configured: set NESSIE_API_KEY and run scripts/nessie_seed.py first.")
    m = nessie.accounts_map()
    maya, acme = m["maya_protected"], m["by_masked"]["****1234"]
    result = await nessie.pay("maya_protected", "****1234", 1.0, "Sudibran hour-one check")
    print("payment:", result)
    withdrawals = await client._request("GET", f"/accounts/{maya}/withdrawals")
    deposits = await client._request("GET", f"/accounts/{acme}/deposits")
    w = next((x for x in withdrawals if (x.get("_id") or x.get("id")) == result["transfer_id"]), None)
    d = next((x for x in deposits if (x.get("_id") or x.get("id")) == result["deposit_id"]), None)
    print("withdrawal on Maya's account:", "FOUND" if w else "MISSING", w or "")
    print("deposit on Acme's account:   ", "FOUND" if d else "MISSING", d or "")
    if not (w and d):
        sys.exit("Nessie didn't return both records: check the account ids in data/nessie.json.")
    print("\nNessie works. (Its balances don't change in this sandbox; Sudibran keeps the ledger.)")


if __name__ == "__main__":
    asyncio.run(main())
