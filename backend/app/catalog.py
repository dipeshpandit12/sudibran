"""Backend-owned seed state, scenarios, attacks, checks and labels."""

import copy
import json
import re
from functools import lru_cache
from pathlib import Path

from app.config import ROOT

DATA = ROOT / "data"

NODE_LABEL = {
    "maya": "Maya",
    "gate": "Gate",
    "seller": "Seller agent",
    "planner": "Planner",
    "parser": "Parser",
    "memory": "Memory",
    "policy": "Policy",
    "broker": "Broker",
    "crs": "CRS",
    "nessie": "Nessie",
    "proxy": "Tool proxy",
    "invoice_reader": "Invoice reader",
    "supplier_db": "Supplier DB",
}

# Who wrote each audit event (R8: every action is tied to an identity).
ACTOR = {
    "maya": "maya",
    "gate": "sudibran-gate",
    "seller": "agent-acme-seller",
    "planner": "model-planner",
    "parser": "model-parser",
    "memory": "sudibran-memory-gate",
    "policy": "sudibran-policy",
    "broker": "sudibran-broker",
    "crs": "svc-crs",
    "nessie": "tool-payment",
    "proxy": "sudibran-mcp-proxy",
    "invoice_reader": "tool-invoice-reader",
    "supplier_db": "tool-supplier-db",
}

STORIES = ["normal_90", "above_threshold", "side_by_side_140"]


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache
def _seed() -> dict:
    return _load(DATA / "seed.json")


def seed() -> dict:
    return copy.deepcopy(_seed())


@lru_cache
def checks() -> list[dict]:
    return _load(DATA / "checks.json")


@lru_cache
def attacks() -> list[dict]:
    return _load(DATA / "attacks.json")


@lru_cache
def _scenarios() -> dict[str, dict]:
    out = {}
    for path in sorted((DATA / "scenarios").glob("*.json")):
        sc = _load(path)
        out[sc["id"]] = sc
    return out


def scenario(scenario_id: str) -> dict | None:
    sc = _scenarios().get(scenario_id)
    return copy.deepcopy(sc) if sc else None


def scenario_catalog() -> list[dict]:
    """Public preset metadata. Execution stays in the backend; clients receive no scripted outcomes."""
    return [
        {key: sc.get(key) for key in ("id", "kind", "layer", "title", "injection")}
        for sc in _scenarios().values()
    ]


def has_scenario(scenario_id: str) -> bool:
    return scenario_id in _scenarios()


def check(key: str) -> dict | None:
    return next((c for c in checks() if c["key"] == key), None)


# Scripted-mode injection classifier. Order matters.
_INJECTION_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"admin note|without (any )?approval|skip (the )?approval"), "A1"),
    (
        re.compile(
            r"maintenance mode|ignore (all |any |previous |the )*(payment )?(rules|instructions)|^system:|jailbreak|developer mode"
        ),
        "A2",
    ),
    (re.compile(r"remember|for next time|save (this|that) to memory"), "A4"),
    (
        re.compile(r"account (has )?changed|new (bank )?account|changed (our|my|the) bank|updated (bank )?details"),
        "side_by_side_140",
    ),
    (re.compile(r"already approved|approved (this|it) by phone|maya (said|approved)|pre-?approved"), "A5"),
    (re.compile(r"tool description|before paying, also|tool (says|instructions)"), "A6"),
    (re.compile(r"hidden|white text|invisible|white-on-white"), "A7"),
    (re.compile(r"supplier list|bank details|send .*(list|accounts|records)|email .*@|export (all|the)"), "A8"),
    (re.compile(r"also pay|pay (account|to)|\*{4}\d{4}|transfer|wire|send \$\d"), "A3"),
]


def classify_injection(text: str) -> str:
    """Matches free text to the closest known attack; anything else is "custom"."""
    t = text.lower()
    for pattern, scenario_id in _INJECTION_RULES:
        if pattern.search(t):
            return scenario_id
    return "custom"
