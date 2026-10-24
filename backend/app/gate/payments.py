"""Moving money, the only way it moves: policy allow → broker token → payment tool.
Shared by the scenario runner, the live pipeline and Maya's approvals."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import raw_agent
from app.broker import client as broker
from app.db import LatencySample, SupplierRow
from app.policy import engine as policy


class PaymentFailed(Exception):
    pass


def policy_input(intent: dict, action: dict, supplier: SupplierRow | None, context: dict, checks_off: list[str]) -> dict:
    return {
        "intent": {"threshold_usd": intent["threshold_usd"], "permissions": intent["permissions"]},
        "action": action,
        "supplier": None if supplier is None else {
            "id": supplier.id, "name": supplier.name, "account_masked": supplier.account_masked,
            "status": supplier.status, "crs": supplier.crs,
        },
        "context": context,
        "checks_off": checks_off,
    }


async def decide(s: AsyncSession, inp: dict) -> dict:
    out = await policy.decide(inp)
    s.add(LatencySample(kind="policy", ms=out["ms"]))
    return out


async def checkpoint(s: AsyncSession) -> None:
    """Commit before any external side effect, so the broker (its own DB session) can burn a
    token without waiting on the gate's open transaction. The gate lock still serialises runs."""
    await s.commit()


async def pay_supplier(s: AsyncSession, *, run_id: str, payment_id: str, supplier: SupplierRow, amount: float,
                       decision_seq: int | None = None) -> dict:
    """Mint a one-time token for exactly this payment and hand it to the payment tool.
    The payee account is looked up by the payment tool from the supplier record."""
    args = {"payment_id": payment_id, "run_id": run_id, "supplier_id": supplier.id, "amount_usd": float(amount)}
    await checkpoint(s)
    try:
        minted = await broker.mint(run_id, "pay", args, decision_seq)
        return await broker.pay(minted["token"], args)
    except broker.BrokerError as e:
        raise PaymentFailed(str(e)) from e


async def raw_pay(to_masked: str, amount: float, run_id: str) -> dict:
    """agent-raw paying without Sudibran (the control group)."""
    return await raw_agent.pay(to_masked, amount, f"agent-raw {run_id}")
