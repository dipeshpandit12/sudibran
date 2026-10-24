"""Settings from the environment (.env). Every integration falls back to a clearly labelled
simulated mode when its key is missing, so the backend always starts."""

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Blank lines in .env (KEY=) fall back to defaults instead of becoming "". Tests point
    # SUDIBRAN_ENV_FILE elsewhere so they never pick up real keys.
    model_config = SettingsConfigDict(
        env_file=os.environ.get("SUDIBRAN_ENV_FILE", str(ROOT / ".env")), env_file_encoding="utf-8",
        extra="ignore", env_ignore_empty=True,
    )

    # Storage. SQLite for local dev and tests, Postgres in docker compose.
    database_url: str = f"sqlite+aiosqlite:///{ROOT / 'sudibran.db'}"

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Policy: "local" evaluates the Python mirror of policy/sudibran.rego in-process,
    # "opa" asks the OPA sidecar. OPA errors deny (R6).
    policy_engine: Literal["local", "opa"] = "local"
    opa_url: str = "http://localhost:8181"

    # /api/inject: "live" runs the real pipeline on the text; "scripted" matches it to a preset
    # by keywords, exactly like the Next.js prototype.
    inject_mode: Literal["live", "scripted"] = "live"

    # Split services. Empty = call in-process (local dev). Set in compose.
    broker_url: str = ""
    parser_url: str = ""
    raw_agent_url: str = ""
    gate_url: str = "http://localhost:8000"
    # Service-to-service secrets. Separate on purpose: the proxy (the agent's only neighbour) knows
    # internal_token, never broker_token, so a compromised proxy still can't mint a payment token.
    internal_token: str = "dev-internal-token"  # proxy + Droid hook → gate
    broker_token: str = "dev-broker-token"  # gate → broker
    parser_token: str = "dev-parser-token"  # gate → parser

    # Ed25519 signing key (PEM). Empty = generated at start and kept in .keys/.
    sudibran_signing_key: str = ""

    # Claude parser (quarantined: no tools, typed fields only).
    anthropic_api_key_parser: str = ""
    parser_model: str = "claude-opus-5-5"

    # Planner: "scripted" (offline), "claude" (Claude tool use), "droid" (Factory Droid exec).
    planner: Literal["scripted", "claude", "droid"] = "scripted"
    # Used only when PLANNER=claude. Droid authenticates through Factory and never receives this key.
    anthropic_api_key_planner: str = ""
    planner_model: str = "claude-opus-5-5"
    droid_bin: str = "droid"
    # Factory catalog model billed through the authenticated Droid subscription (not a custom/BYOK model).
    droid_model: str = "claude-opus-5-5"
    droid_reasoning_effort: str = "low"
    droid_mcp_server: str = "sudibran"
    droid_timeout_s: int = 180
    droid_mcp_url: str = ""  # where Droid reaches Sudibran's MCP server; default {gate_url}/mcp
    # high: Droid runs its (allowlisted) tools without stopping to ask. Required for MCP calls made from
    # Droid's Script runtime in headless mode. Safe because the only tools are Sudibran's and every call
    # is checked server-side (gate_check) before it runs.
    droid_autonomy: str = "high"
    factory_api_key: str = ""  # optional for automation; a local `droid` login uses subscription credentials

    # Capital One Nessie. Empty key = simulated ledger (labelled simulated everywhere).
    nessie_api_key: str = ""
    nessie_base_url: str = "https://api.nessieisreal.com"
    nessie_accounts_file: str = str(ROOT / "data" / "nessie.json")

    # CRS Credit API. Empty = simulated results from data/crs_simulated.json.
    crs_base_url: str = ""
    crs_api_key: str = ""
    crs_username: str = ""
    crs_password: str = ""
    crs_check_path: str = "/transunion/identity-manager-verification/basic"  # TruValidate, decides R7
    crs_fraud_path: str = "/fraud-finder/fraud-finder"  # AtData Fraud Finder, signal only
    crs_identities_file: str = str(ROOT / "data" / "crs_identities.json")

    # Shared secret the seller agent signs its action reports with (R3).
    seller_agent_secret: str = "acme-seller-demo-secret"

    # MCP proxy (the only tools the agent can see). proxy_forward=true when the proxy runs as its
    # own service and forwards tool calls to the gate over HTTP.
    proxy_forward: bool = False
    mcp_allowed_hosts: str = "localhost:*,127.0.0.1:*,proxy:*,gate:*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
