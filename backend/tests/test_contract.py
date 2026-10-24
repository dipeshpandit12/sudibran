"""Contract parity with the Next.js prototype: replay the recorded request sequence against this
backend and require every normalised response to match. This is what makes pointing the
frontend at FastAPI a no-op for the UI."""

import json
from pathlib import Path

from contract_sequence import normalize, sequence

GOLDEN = Path(__file__).resolve().parent / "golden" / "mock_responses.json"

# Deliberate differences: places where the prototype has a bug the backend fixes.
KNOWN_FIXES = [
    # The prototype writes the approval card's reason from the unstamped scenario text, so after
    # Maya changes her threshold the card still says "$500" while the audit event says the new
    # value. The backend uses the current threshold on both.
    ("approvals[", "].reason", "threshold, so she decides"),
]


def is_known_fix(diff: str) -> bool:
    return any(all(part in diff for part in parts) for parts in KNOWN_FIXES)


def first_diff(a, b, path="$"):
    if type(a) is not type(b):
        return f"{path}: {type(a).__name__} {a!r:.120} != {type(b).__name__} {b!r:.120}"
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                return f"{path}.{k}: missing in backend (mock has {b[k]!r:.120})"
            if k not in b:
                return f"{path}.{k}: extra in backend ({a[k]!r:.120})"
            d = first_diff(a[k], b[k], f"{path}.{k}")
            if d:
                return d
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path}: length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            d = first_diff(x, y, f"{path}[{i}]")
            if d:
                return d
        return None
    return None if a == b else f"{path}: {a!r:.160} != {b!r:.160}"


def test_every_response_matches_the_prototype(client):
    golden = json.loads(GOLDEN.read_text())
    steps = sequence()
    assert len(golden) == len(steps), "sequence changed: re-record with tests/record_mock.py"
    failures = []
    for i, ((method, path, body), rec) in enumerate(zip(steps, golden)):
        assert (method, path) == (rec["method"], rec["path"])
        r = client.request(method, path, json=body) if body is not None else client.request(method, path)
        if r.status_code != rec["status"]:
            failures.append(f"#{i} {method} {path}: status {r.status_code} != {rec['status']} ({r.text[:200]})")
            continue
        d = first_diff(normalize(r.json()), normalize(rec["json"]))
        if d and not is_known_fix(d):
            failures.append(f"#{i} {method} {path}: {d}")
    assert not failures, f"{len(failures)} of {len(steps)} responses differ:\n" + "\n".join(failures[:25])
