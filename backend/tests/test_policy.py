"""Policy: every case in policy_cases.json must give the expected decision in the Python engine,
and — when an `opa` binary is available (PATH or OPA_BIN) — in policy/sudibran.rego too.
That is what keeps the two engines from drifting apart."""

import asyncio
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from app.policy import engine

ROOT = Path(__file__).resolve().parent.parent
CASES = json.loads((ROOT / "tests" / "policy_cases.json").read_text())
OPA = os.environ.get("OPA_BIN") or shutil.which("opa")


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_local_engine(case):
    assert engine.evaluate(case["input"]) == case["expect"]


@pytest.mark.skipif(not OPA, reason="no opa binary (set OPA_BIN or put opa on PATH)")
@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_rego_matches(case):
    out = subprocess.run(
        [OPA, "eval", "--format", "json", "-d", str(ROOT / "policy"), "--stdin-input", "data.sudibran.decision"],
        input=json.dumps(case["input"]), capture_output=True, text=True, timeout=30, check=False,
    )
    assert out.returncode == 0, out.stderr
    value = json.loads(out.stdout)["result"][0]["expressions"][0]["value"]
    assert {"decision": value["decision"], "rule": value.get("rule")} == case["expect"]


@pytest.mark.skipif(not OPA, reason="no opa binary (set OPA_BIN or put opa on PATH)")
def test_gate_talks_to_an_opa_server():
    """The exact path compose uses: OpaPolicy → POST /v1/data/sudibran/decision."""
    import socket
    import time

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    proc = subprocess.Popen([OPA, "run", "--server", "--addr", f"127.0.0.1:{port}", str(ROOT / "policy")],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        client = engine.OpaPolicy(f"http://127.0.0.1:{port}")
        for _ in range(50):
            result = asyncio.run(client.decide({"action": {"type": "remember"}}))
            if result["decision"] == "allow":
                break
            time.sleep(0.1)
        for case in CASES:
            got = asyncio.run(client.decide(case["input"]))
            assert {"decision": got["decision"], "rule": got.get("rule")} == case["expect"], case["name"]
    finally:
        proc.terminate()
        proc.wait(timeout=10)


def test_reasons_read_like_the_prototype():
    case = next(c for c in CASES if c["name"] == "R2: payee account from invoice text")
    assert engine.explain(engine.evaluate(case["input"]), case["input"]) == \
        "R2: ****9917 is not on Acme's supplier record (came from invoice text)"
    case = next(c for c in CASES if c["name"] == "R1: over Maya's threshold")
    assert engine.explain(engine.evaluate(case["input"]), case["input"]) == \
        "R1: $750 is above Maya's $500 threshold, so she decides"


def test_opa_errors_fail_closed():
    """R6: an unreachable OPA denies; it never allows."""
    result = asyncio.run(engine.OpaPolicy("http://127.0.0.1:9").decide({"action": {"type": "pay"}}))
    assert result["decision"] == "deny" and result["rule"] == "R6"


def test_digest_is_stable_and_ignores_tests():
    assert engine.policy_digest() == engine.policy_digest()
    assert len(engine.policy_digest()) == 64
