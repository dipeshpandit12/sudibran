"""One-time capability tokens (broker). A token authorises exactly one tool call with
exactly these arguments, for a short time. The payment tool burns the nonce on use."""

import json
import time
import uuid

import jwt

from app.security.keys import private_key, public_key
from app.util import sha256_hex

ISSUER = "sudibran-broker"
TTL_S = 120


class TokenError(Exception):
    pass


def args_hash(args: dict) -> str:
    return sha256_hex(json.dumps(args, sort_keys=True, separators=(",", ":")))


def mint(run_id: str, tool: str, args: dict, decision_seq: int | None) -> dict:
    nonce = uuid.uuid4().hex
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "sub": run_id,
        "tool": tool,
        "args_hash": args_hash(args),
        "decision_seq": decision_seq,
        "nonce": nonce,
        "iat": now,
        "exp": now + TTL_S,
    }
    token = jwt.encode(claims, private_key(), algorithm="EdDSA")
    return {"token": token, "nonce": nonce, "expires_at": claims["exp"]}


def verify(token: str, tool: str, args: dict) -> dict:
    try:
        claims = jwt.decode(token, public_key(), algorithms=["EdDSA"], issuer=ISSUER)
    except jwt.PyJWTError as e:
        raise TokenError(f"invalid token: {e}") from e
    if claims.get("tool") != tool:
        raise TokenError("token was issued for a different tool")
    if claims.get("args_hash") != args_hash(args):
        raise TokenError("token was issued for different arguments")
    return claims
