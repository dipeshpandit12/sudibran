"""The R8 hash chain. canonical() must produce the same string as canonical() in
frontend/lib/chain.ts, because the browser re-hashes every event itself."""

import json

from app.util import sha256_hex

GENESIS = "0" * 64


def canonical(e: dict) -> str:
    return json.dumps(
        [
            e["seq"],
            e["time"],
            e["run_id"],
            e["step"],
            e["layer"],
            e["mechanism"],
            e["node"],
            e["edge"],
            e["decision"],
            e["reason"],
            e.get("rule"),
            e.get("off") or False,
            e["actor"],
            e["labels"],
            e.get("payment_id"),
            e["prev_hash"],
        ],
        separators=(",", ":"),
        ensure_ascii=False,
    )


def event_hash(e: dict) -> str:
    return sha256_hex(canonical(e))


def verify(events: list[dict]) -> dict:
    """Checks every event's hash and its link to the one before it.
    Returns the ChainCheck shape the evidence report uses."""
    for i, e in enumerate(events):
        expect_prev = GENESIS if i == 0 else events[i - 1]["hash"]
        if e["prev_hash"] != expect_prev or event_hash(e) != e["hash"]:
            return {"intact": False, "checked_events": len(events), "broken_at": e["seq"]}
    return {"intact": True, "checked_events": len(events), "broken_at": None}
