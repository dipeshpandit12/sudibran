"""The browser re-hashes every audit event with frontend/lib/chain.ts. Events written by
this backend must pass that exact code, or every evidence report shows "chain broken"."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.audit.chain import GENESIS, canonical, event_hash, verify

CHAIN_TS = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "chain.ts"

VERIFY_JS = """
const { verifyInBrowser, canonical } = await import(process.argv[2]);
const events = JSON.parse(await new Promise(r => { let d=''; process.stdin.on('data', c => d += c); process.stdin.on('end', () => r(d)); }));
const result = await verifyInBrowser(events);
const { hash, ...first } = events[0];
console.log(JSON.stringify({ ...result, canonical0: canonical(first) }));
"""


def _events(client) -> list[dict]:
    for path in ("/api/story/normal_90", "/api/attacks/A3", "/api/story/above_threshold", "/api/attacks/A8"):
        assert client.post(path).status_code == 200
    client.post("/api/switches", json={"layer_off": "policy_r2"})
    client.post("/api/attacks/A7")
    client.post("/api/chat", json={"text": "unicode check: café · ≠ — ✓"})
    approvals = client.get("/api/approvals").json()
    client.post(f"/api/approvals/{approvals[0]['id']}", json={"action": "approve"})
    return client.get("/api/audit").json()


def test_python_chain_verifies(client):
    events = _events(client)
    assert events[0]["prev_hash"] == GENESIS
    assert verify(events)["intact"]
    tampered = json.loads(json.dumps(events))
    tampered[3]["reason"] = "Approved by Maya"  # rewrite history
    assert verify(tampered) == {"intact": False, "checked_events": len(events), "broken_at": tampered[3]["seq"]}


@pytest.mark.skipif(not shutil.which("node") or not CHAIN_TS.exists(), reason="needs node and frontend")
def test_browser_verifier_accepts_backend_events(client, tmp_path):
    events = _events(client)
    script = tmp_path / "verify.mjs"
    script.write_text(VERIFY_JS)
    out = subprocess.run(["node", str(script), str(CHAIN_TS)], input=json.dumps(events), capture_output=True,
                         text=True, timeout=60, check=False)
    assert out.returncode == 0, out.stderr
    result = json.loads(out.stdout.strip().splitlines()[-1])
    assert result["intact"] is True, result
    first = {k: v for k, v in events[0].items() if k != "hash"}
    assert result["canonical0"] == canonical(first)
    assert event_hash(first) == events[0]["hash"]
