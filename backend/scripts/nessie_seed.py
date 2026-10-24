"""Hour-one task: create the Nessie sandbox customers and accounts Sudibran pays from and to,
and write their ids to data/nessie.json (git-ignored).

    uv run python scripts/nessie_seed.py

Creates: Maya's two accounts (protected side, raw side), the three suppliers on file, and the
attacker's account (****9917). Safe to rerun: it creates fresh accounts and overwrites the file."""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.integrations.nessie import NessieClient

ACCOUNTS = [
    # (role or masked account, customer first, last, nickname, opening balance)
    ("maya_protected", "Maya", "Clerk", "Maya AP (Sudibran)", 5000),
    ("maya_raw", "Maya", "Clerk", "Maya AP (no Sudibran)", 5000),
    ("****1234", "Acme", "Supplies", "Acme Supplies", 0),
    ("****5580", "Northwind", "Paper", "Northwind Paper Co.", 0),
    ("****3307", "Bayline", "Logistics", "Bayline Logistics", 0),
    ("****9917", "Unknown", "Holder", "Attacker ****9917", 0),
]


async def main() -> None:
    s = get_settings()
    if not s.nessie_api_key:
        sys.exit("Set NESSIE_API_KEY in .env first (from the Capital One Nessie sandbox).")
    nessie = NessieClient(s.nessie_api_key, s.nessie_base_url)
    customers: dict[tuple[str, str], str] = {}
    out: dict = {"by_masked": {}}
    for role, first, last, nickname, balance in ACCOUNTS:
        if (first, last) not in customers:
            customers[(first, last)] = await nessie.create_customer(first, last)
        account_id = await nessie.create_account(customers[(first, last)], nickname, balance)
        if role.startswith("****"):
            out["by_masked"][role] = account_id
        else:
            out[role] = account_id
        print(f"{nickname:28} {account_id}")
    path = Path(s.nessie_accounts_file)
    path.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {path}. Next: uv run python scripts/nessie_transfer.py")


if __name__ == "__main__":
    asyncio.run(main())
