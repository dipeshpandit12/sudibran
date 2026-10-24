"""Ed25519 signing key. Signs Maya's intent and the broker's one-time capability tokens.
Self-signed on purpose: no external auth service in the payment path."""

import base64
import os
from functools import lru_cache

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from app.config import ROOT, get_settings

KEY_FILE = ROOT / ".keys" / "signing.pem"


@lru_cache
def private_key() -> Ed25519PrivateKey:
    pem = get_settings().sudibran_signing_key.strip()
    if pem:
        key = serialization.load_pem_private_key(pem.replace("\\n", "\n").encode(), password=None)
    elif KEY_FILE.exists():
        key = serialization.load_pem_private_key(KEY_FILE.read_bytes(), password=None)
    else:
        key = Ed25519PrivateKey.generate()
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        KEY_FILE.write_bytes(
            key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        )
        os.chmod(KEY_FILE, 0o600)
    assert isinstance(key, Ed25519PrivateKey)
    return key


def public_key() -> Ed25519PublicKey:
    return private_key().public_key()


def public_key_pem() -> str:
    return public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()


def sign(message: str) -> str:
    return base64.b64encode(private_key().sign(message.encode("utf-8"))).decode()


def verify(message: str, signature: str) -> bool:
    try:
        public_key().verify(base64.b64decode(signature), message.encode("utf-8"))
        return True
    except Exception:
        return False


def intent_message(intent: dict) -> str:
    """What exactly gets signed: the parts of the intent that grant authority."""
    perms = ",".join(sorted(intent["permissions"]))
    # Canonical number format, so 500 (JSON seed) and 500.0 (database float) sign identically.
    return f"{intent['id']}|{intent['text']}|{float(intent['threshold_usd']):.2f}|{perms}|{intent['created_at']}"
