"""CRS (TruValidate + Fraud Finder). Fixtures are real CalHacks sandbox responses for test
identities (SSN prefix 666, never issued). The live test only runs with CRS credentials:

    CRS_LIVE=1 uv run pytest tests/test_crs.py      # reads CRS_* from .env"""

import asyncio
import json
import os
from pathlib import Path

import pytest

from app.integrations import crs

FIX = Path(__file__).resolve().parent / "fixtures" / "crs"


@pytest.mark.parametrize("fixture, expected", [
    ("truvalidate_low_found.json", "clean"),
    ("truvalidate_medium_wrong_address.json", "mismatch"),
    ("truvalidate_medium_not_found.json", "mismatch"),
    ("truvalidate_high_invalid_ssn.json", "flagged"),
])
def test_interpret_real_sandbox_responses(fixture, expected):
    verdict = crs.interpret(json.loads((FIX / fixture).read_text()))
    assert verdict["result"] == expected
    assert verdict["signals"][0].startswith("TruValidate risk ")


def test_high_risk_names_the_reason():
    verdict = crs.interpret(json.loads((FIX / "truvalidate_high_invalid_ssn.json").read_text()))
    assert "4551: INPUT SSN IS INVALID" in verdict["signals"]
    assert verdict["summary"]["points"] == 150


def test_unrecognised_response_fails_closed():
    assert crs.interpret({})["result"] == "error"
    assert crs.interpret({"custom": {"idmanagerVerAnalysisV2": {}}})["result"] == "error"


def test_deceased_or_mismatch_alerts_are_flagged():
    raw = json.loads((FIX / "truvalidate_low_found.json").read_text())
    addon = next(a for a in raw["addOnProducts"] if a.get("idManagerVerification") is not None)
    addon["idManagerVerification"]["deceases"] = [{"dateOfDeath": "2020-01-01"}]
    assert crs.interpret(raw)["result"] == "flagged"


@pytest.mark.skipif(not os.environ.get("CRS_LIVE"), reason="set CRS_LIVE=1 to call the CRS sandbox")
def test_live_sandbox_verdicts(monkeypatch):
    """Every mapped account holder gets the verdict the demo relies on, from the real sandbox."""
    from app.config import ROOT, get_settings

    env = ROOT / ".env"
    for line in env.read_text().splitlines() if env.exists() else []:
        key, _, value = line.partition("=")
        if key.startswith("CRS_") and value:
            monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    try:
        client = crs.client()
        assert isinstance(client, crs.LiveCrs), "CRS_* not set in .env"
        expected = {"****1234": "clean", "****5580": "clean", "****3307": "clean", "****9917": "flagged",
                    "****4242": "mismatch"}
        got = {acct: asyncio.run(client.check(acct))["result"] for acct in expected}
        assert got == expected
    finally:
        get_settings.cache_clear()
