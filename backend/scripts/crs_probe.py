"""Hour-one check: run every account holder in data/crs_identities.json through the live CRS
sandbox (TruValidate + Fraud Finder) and print the verdict Sudibran would act on.

    uv run python scripts/crs_probe.py            # verdicts
    uv run python scripts/crs_probe.py --raw      # plus the raw TruValidate response for each

Needs CRS_BASE_URL, CRS_USERNAME and CRS_PASSWORD in .env. Test identities only."""

import asyncio
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.integrations import crs


async def main(raw: bool) -> None:
    client = crs.client()
    if not isinstance(client, crs.LiveCrs):
        sys.exit("CRS isn't configured: set CRS_BASE_URL, CRS_USERNAME and CRS_PASSWORD in .env.")
    for masked, ident in crs.identities().items():
        if masked.startswith("_"):
            continue
        res = await client.check(masked)
        print(f"\n{masked}  {res['subject']}")
        print(f"   verdict: {res['result'].upper()}   ({res['source']})")
        for sig in res["signals"]:
            print(f"   · {sig}")
        if raw and ident.get("identity"):
            async with httpx.AsyncClient(timeout=30.0) as http:
                r = await client.post(http, client.path, ident["identity"])
                print(json.dumps(r.json(), indent=1)[:4000])


if __name__ == "__main__":
    asyncio.run(main("--raw" in sys.argv))
