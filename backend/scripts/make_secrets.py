"""Print fresh service secrets and an Ed25519 signing key, ready to paste into .env.
    uv run python scripts/make_secrets.py >> .env"""

import secrets

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

pem = Ed25519PrivateKey.generate().private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
).decode()
print(f"INTERNAL_TOKEN={secrets.token_urlsafe(32)}")
print(f"BROKER_TOKEN={secrets.token_urlsafe(32)}")
print(f"PARSER_TOKEN={secrets.token_urlsafe(32)}")
print(f"SELLER_AGENT_SECRET={secrets.token_urlsafe(24)}")
print("SUDIBRAN_SIGNING_KEY=" + pem.strip().replace("\n", "\\n"))
