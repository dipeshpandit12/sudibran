import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

# Isolated, offline settings for every test run. Set before app modules read them.
_tmp = tempfile.mkdtemp(prefix="sudibran-test-")
os.environ.update({
    "SUDIBRAN_ENV_FILE": f"{_tmp}/no.env",  # never read the developer's real .env
    "DATABASE_URL": f"sqlite+aiosqlite:///{_tmp}/test.db",
    "INJECT_MODE": "scripted",
    "POLICY_ENGINE": "local",
    "PLANNER": "scripted",
    "ANTHROPIC_API_KEY_PARSER": "",
    "ANTHROPIC_API_KEY_PLANNER": "",
    "NESSIE_API_KEY": "",
    "NESSIE_ACCOUNTS_FILE": f"{_tmp}/no-nessie.json",
    "CRS_BASE_URL": "",
    "BROKER_URL": "",
    "PARSER_URL": "",
    "RAW_AGENT_URL": "",
    "PROXY_FORWARD": "false",
})


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.main import app

    get_settings.cache_clear()
    with TestClient(app) as c:
        c.post("/api/demo/reset")
        yield c


@pytest.fixture
def live_client(client, monkeypatch):
    """The same app with /api/inject running the live pipeline."""
    from app.config import get_settings

    monkeypatch.setenv("INJECT_MODE", "live")
    get_settings.cache_clear()
    yield client
    get_settings.cache_clear()
