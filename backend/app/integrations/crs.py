"""CRS Credit API: identity and fraud checks on bank-account holders (R7 and supplier enrollment).

Live calls go to the CRS CalHacks sandbox (StitchCredit platform, spec at
portal.internal.crscreditapi.com/developer-resources/calhacks-openapi-spec.json):

  POST /users/login                                     → bearer token (cached, re-login on 401)
  POST /transunion/identity-manager-verification/basic  → TruValidate identity verification. DECIDES R7.
  POST /fraud-finder/fraud-finder                        → AtData email fraud risk. Recorded as a signal
                                                           only: the sandbox scores every new email 100.

Two clients, one interface. SimulatedCrs (no CRS_* settings) reads `simulated_result` from
data/crs_identities.json and labels every result source="simulated". Use the CRS sandbox test
identities only. An error is never "clean": callers fail closed on result="error"."""

import json
from pathlib import Path

import httpx

from app.config import get_settings


def identities() -> dict:
    """{"****1234": {"subject": "...", "identity": {TruValidate body}, "email": "...", "simulated_result": ...}}"""
    path = Path(get_settings().crs_identities_file)
    return json.loads(path.read_text()) if path.exists() else {}


def identity_for(account_masked: str) -> dict:
    return identities().get(account_masked) or {
        "subject": f"unknown holder of {account_masked}",
        "identity": None,
        "simulated_result": "mismatch",
        "signals": ["no CRS identity on file for this account"],
    }


class SimulatedCrs:
    source = "simulated"

    async def check(self, account_masked: str, identity: dict | None = None, email: str | None = None) -> dict:
        ident = identity_for(account_masked)
        return {
            "result": ident.get("simulated_result", "clean"),
            "source": self.source,
            "subject": ident.get("subject"),
            "signals": ident.get("signals", []),
        }


_TOKEN: str | None = None  # shared across LiveCrs instances; refreshed on 401


class LiveCrs:
    source = "live"

    def __init__(self):
        s = get_settings()
        self.base = s.crs_base_url.rstrip("/")
        self.api_key = s.crs_api_key
        self.username = s.crs_username
        self.password = s.crs_password
        self.path = s.crs_check_path
        self.fraud_path = s.crs_fraud_path

    async def _auth_headers(self, client: httpx.AsyncClient, refresh: bool = False) -> dict:
        global _TOKEN
        if self.api_key:
            return {"Authorization": f"Bearer {self.api_key}"}
        if _TOKEN is None or refresh:
            r = await client.post(f"{self.base}/users/login", json={"username": self.username, "password": self.password})
            r.raise_for_status()
            _TOKEN = r.json()["token"]
        return {"Authorization": f"Bearer {_TOKEN}"}

    async def post(self, client: httpx.AsyncClient, path: str, body: dict) -> httpx.Response:
        """POST with the bearer token; logs in again once if the token has expired."""
        r = await client.post(f"{self.base}{path}", json=body, headers=await self._auth_headers(client))
        if r.status_code == 401 and not self.api_key:
            r = await client.post(f"{self.base}{path}", json=body, headers=await self._auth_headers(client, True))
        return r

    async def check(self, account_masked: str, identity: dict | None = None, email: str | None = None) -> dict:
        """TruValidate on the account holder decides; Fraud Finder on their email adds a signal."""
        ident = identity_for(account_masked)
        body = identity or ident.get("identity")
        subject = ident["subject"] if identity is None else f"{body.get('firstName')} {body.get('lastName')}"
        if not body:
            return {"result": "mismatch", "source": self.source, "subject": subject,
                    "signals": ["no CRS test identity mapped to this account"]}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await self.post(client, self.path, body)
                r.raise_for_status()
                verdict = interpret(r.json())
                fraud = None
                email = email or ident.get("email")
                if email and self.fraud_path:
                    fraud = await self._fraud_finder(client, email, body)
        except Exception as e:
            return {"result": "error", "source": self.source, "subject": subject,
                    "signals": [f"CRS call failed: {type(e).__name__}: {e}"[:200]]}
        signals = verdict["signals"] + ([fraud["signal"]] if fraud else [])
        return {"result": verdict["result"], "source": self.source, "subject": subject, "signals": signals,
                "truvalidate": verdict["summary"], "fraud_finder": fraud}

    async def _fraud_finder(self, client: httpx.AsyncClient, email: str, identity: dict) -> dict | None:
        body = {"email": email, "firstName": identity.get("firstName"), "lastName": identity.get("lastName"),
                "address": {"addressLine1": identity.get("street1"), "city": identity.get("city"),
                            "state": identity.get("state"), "postalCode": identity.get("zip")}}
        r = await self.post(client, self.fraud_path, body)
        if r.status_code != 200:
            return {"signal": f"Fraud Finder unavailable (HTTP {r.status_code})"}
        raw = r.json()
        score = (raw.get("risk") or {}).get("score")
        status = (raw.get("email_validation") or {}).get("status")
        return {"score": score, "email_status": status, "first_seen": (raw.get("eam") or {}).get("date_first_seen"),
                "signal": f"Fraud Finder: email risk {score}/100, {status or 'no status'} (informational)"}


def interpret(raw: dict) -> dict:
    """Map a TruValidate (TransUnion Identity Manager Verification) response to a verdict.

    Observed in the CalHacks sandbox:
      real test identity              → riskIndicator LOW,    SUBJECT_FOUND, all MATCH       → clean
      right person, wrong address     → riskIndicator MEDIUM, "ADDRESS DOES NOT MATCH"        → mismatch
      wrong name on the SSN           → riskIndicator MEDIUM, SUBJECT_NOT_FOUND               → mismatch
      unknown SSN                     → riskIndicator HIGH,   "INPUT SSN IS INVALID", 150 pts → flagged
    Deceased records and ID-mismatch alerts are flagged too. Anything unrecognised fails closed."""
    analysis = ((raw.get("custom") or {}).get("idmanagerVerAnalysisV2")) or {}
    summary = analysis.get("verificationSummary") or {}
    match = (analysis.get("verificationAnalysises") or [{}])[0] or {}
    addon = next((a for a in raw.get("addOnProducts") or [] if a.get("idManagerVerification") is not None), {})
    idmv = addon.get("idManagerVerification") or {}
    messages = [f"{m.get('code')}: {m.get('text')}" for m in idmv.get("messages") or [] if m.get("text")]
    alerts = [json.dumps(a)[:120] for a in addon.get("idMismatchAlerts") or []]
    deceased = bool(idmv.get("deceases"))
    risk = summary.get("riskIndicator")
    status = match.get("verificationStatus")
    out_summary = {
        "risk": risk, "points": summary.get("verificationPoint"), "status": status,
        "matches": {k.replace("Verification", ""): v for k, v in match.items()
                    if k.endswith("Verification") and v not in ("MATCH_NOT_PERFORMED", "INPUT_NOT_AVAILABLE")},
        "messages": messages,
    }
    signals = [f"TruValidate risk {risk}" + (f" ({summary.get('verificationPoint')} pts)" if risk else "")] + messages
    if risk is None or status is None:
        return {"result": "error", "signals": ["TruValidate response had no verdict"], "summary": out_summary}
    if risk == "HIGH" or deceased or alerts:
        return {"result": "flagged", "signals": signals + alerts + (["deceased record"] if deceased else []),
                "summary": out_summary}
    if risk != "LOW" or status != "SUBJECT_FOUND":
        return {"result": "mismatch", "signals": signals + [f"verification status {status}"], "summary": out_summary}
    return {"result": "clean", "signals": signals, "summary": out_summary}


def client():
    s = get_settings()
    if s.crs_base_url and (s.crs_api_key or (s.crs_username and s.crs_password)):
        return LiveCrs()
    return SimulatedCrs()


def mode() -> str:
    return client().source
