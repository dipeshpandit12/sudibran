"""Small helpers shared across the gate. Formatting matches the Next.js prototype so
reasons, hashes and UI text line up byte for byte."""

import hashlib
import math
from datetime import UTC, datetime


def now() -> str:
    """ISO time with milliseconds and Z, exactly like JavaScript's Date.toISOString()."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def round2(n: float) -> float:
    """Math.round(n * 100) / 100: half rounds up, not to even like Python's round()."""
    return math.floor(n * 100 + 0.5) / 100


def usd(n: float) -> str:
    """Matches n.toLocaleString("en-US", { style: "currency", currency: "USD" })."""
    sign = "-" if n < 0 else ""
    return f"{sign}${abs(n):,.2f}"


def mask(account: str) -> str:
    digits = "".join(ch for ch in account if ch.isdigit())
    return f"****{digits[-4:]}" if len(digits) >= 4 else "****"


def pad3(n: int) -> str:
    return str(n).zfill(3)
