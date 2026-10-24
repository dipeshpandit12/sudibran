#!/usr/bin/env python3
"""Droid PreToolUse hook: ask the Sudibran gate before any tool runs.

Droid passes the tool call as JSON on stdin. We forward it to the gate and block (exit 2,
reason on stderr) unless the gate allows it. If the gate can't be reached, we block too.

Droid hooks fail open if the hook itself crashes or times out, so this is a courtesy layer:
the MCP proxy's fingerprint check and the broker's one-time token are the hard stops.
Standard library only, so it runs wherever Droid runs."""

import json
import os
import sys
import urllib.request

GATE = os.environ.get("SUDIBRAN_GATE_URL", "http://localhost:8000")
TOKEN = os.environ.get("SUDIBRAN_INTERNAL_TOKEN", "dev-internal-token")


def main() -> int:
    try:
        call = json.load(sys.stdin)
    except Exception:
        print("Sudibran: couldn't read the tool call, so it's blocked", file=sys.stderr)
        return 2
    body = json.dumps({
        "session_id": call.get("session_id"),
        "tool_name": call.get("tool_name", ""),
        "tool_input": call.get("tool_input") or {},
    }).encode()
    req = urllib.request.Request(f"{GATE}/internal/hooks/pre-tool-use", data=body, method="POST",
                                 headers={"content-type": "application/json", "x-internal-token": TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            verdict = json.load(resp)
    except Exception as e:
        print(f"Sudibran gate unreachable ({e}), so the tool call is blocked", file=sys.stderr)
        return 2
    if verdict.get("decision") != "allow":
        print(f"Sudibran: {verdict.get('reason', 'denied')}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
