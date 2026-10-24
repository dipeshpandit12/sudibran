"""Record the Next.js prototype's responses for tests/contract_sequence.py.

    cd ../frontend && npx next dev -p 3100
    uv run python tests/record_mock.py http://localhost:3100

Writes tests/golden/mock_responses.json. Re-record only when the prototype's contract changes."""

import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract_sequence import sequence

OUT = Path(__file__).resolve().parent / "golden" / "mock_responses.json"


def main(base: str) -> None:
    records = []
    with httpx.Client(base_url=base, timeout=60.0) as client:
        for method, path, body in sequence():
            r = client.request(method, path, json=body) if body is not None else client.request(method, path)
            records.append({"method": method, "path": path, "body": body, "status": r.status_code, "json": r.json()})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(records, indent=1, ensure_ascii=False))
    print(f"recorded {len(records)} responses → {OUT}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100")
