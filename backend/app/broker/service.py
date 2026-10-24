"""Broker + payment tool. The only code that holds the Nessie key and the signing key.

- mint(): issue a one-time token bound to {tool, exact args}, only after a policy allow.
- pay():  verify the token, burn its nonce (one use), look the payee up in the supplier record
          (never from the caller), then move the money on Nessie (or the simulated ledger).

Runs in-process for local dev, or as its own service (BROKER_URL) in compose:
    uvicorn app.broker.service:app --port 8001"""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.config import get_settings
from app.db import SupplierRow, TokenNonce, create_all, session
from app.integrations import nessie
from app.security import keys, tokens
from app.util import now


class PaymentRefused(Exception):
    pass


async def mint(run_id: str, tool: str, args: dict, decision_seq: int | None = None) -> dict:
    return tokens.mint(run_id, tool, args, decision_seq)


async def pay(token: str, args: dict) -> dict:
    """args = {payment_id, run_id, supplier_id, amount_usd}. There is no account argument."""
    try:
        claims = tokens.verify(token, "pay", args)
    except tokens.TokenError as e:
        raise PaymentRefused(str(e)) from e
    async with session() as s:
        if await s.get(TokenNonce, claims["nonce"]):
            raise PaymentRefused("token already used")
        s.add(TokenNonce(nonce=claims["nonce"], used_at=now()))
        supplier = (await s.execute(select(SupplierRow).where(SupplierRow.id == args["supplier_id"]))).scalar_one_or_none()
        if supplier is None or supplier.status != "active":
            await s.commit()  # the nonce stays burned
            raise PaymentRefused("supplier isn't on file")
        await s.commit()
    description = f"Sudibran {args['payment_id']} · {supplier.name}"
    try:
        out = await nessie.pay("maya_protected", supplier.account_masked, float(args["amount_usd"]), description,
                               payee_id=supplier.nessie_account_id)
    except nessie.NessieError as e:
        raise PaymentRefused(f"Nessie didn't accept the transfer: {e}") from e
    return {**out, "account_masked": supplier.account_masked}


async def open_payee_account(name: str) -> str | None:
    """Only the broker holds the Nessie key, so it opens the account for a newly attested supplier."""
    return await nessie.open_payee_account(name)


async def sign_intent(message: str) -> str:
    return keys.sign(message)


# ───────────── HTTP service (compose) ─────────────


class MintIn(BaseModel):
    run_id: str
    tool: str
    args: dict
    decision_seq: int | None = None


class PayIn(BaseModel):
    token: str
    args: dict


class AccountIn(BaseModel):
    name: str


class SignIn(BaseModel):
    message: str


def _internal(x_internal_token: str = Header(default="")) -> None:
    expected = get_settings().broker_token
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="the gate only")


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    await create_all()
    yield


app = FastAPI(title="Sudibran broker", docs_url=None, redoc_url=None, lifespan=_lifespan)


@app.post("/mint", dependencies=[Depends(_internal)])
async def http_mint(body: MintIn) -> dict:
    return await mint(body.run_id, body.tool, body.args, body.decision_seq)


@app.post("/pay", dependencies=[Depends(_internal)])
async def http_pay(body: PayIn) -> dict:
    try:
        return await pay(body.token, body.args)
    except PaymentRefused as e:
        raise HTTPException(status_code=403, detail=str(e)) from e


@app.post("/accounts", dependencies=[Depends(_internal)])
async def http_open_account(body: AccountIn) -> dict:
    try:
        return {"nessie_account_id": await open_payee_account(body.name)}
    except nessie.NessieError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/sign", dependencies=[Depends(_internal)])
async def http_sign(body: SignIn) -> dict:
    return {"signature": await sign_intent(body.message)}


@app.get("/public-key")
async def http_public_key() -> dict:
    return {"alg": "Ed25519", "pem": keys.public_key_pem()}


@app.get("/health")
async def http_health() -> dict:
    return {"ok": True, "nessie": nessie.mode()}
