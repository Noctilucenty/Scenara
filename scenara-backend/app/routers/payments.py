# app/routers/payments.py
"""
Paused for current product direction.

This router supports the older Orryin fintech flow:
- Wise FX rate lookup
- sandbox transfer simulation
- transaction logging for FX-related actions

It is intentionally kept for future reuse,
but it is NOT mounted in app/main.py for the current
market-intelligence / prediction-simulation pivot.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.integrations.wise_client import WiseClient

router = APIRouter()


# ---------- Schemas ----------

class FxRateResponse(BaseModel):
    source: str
    target: str
    rate: Decimal
    source_amount: Optional[Decimal] = None
    target_amount: Optional[Decimal] = None


class SandboxTransferRequest(BaseModel):
    user_id: int
    account_id: int
    source_currency: str = Field(..., min_length=3, max_length=3)
    target_currency: str = Field(..., min_length=3, max_length=3)
    source_amount: Decimal = Field(..., gt=0)


class SandboxTransferResponse(BaseModel):
    user_id: int
    account_id: int
    source_currency: str
    target_currency: str
    source_amount: Decimal
    estimated_target_amount: Decimal
    fx_rate: Decimal
    wise_quote_snapshot: dict


# ---------- Endpoints ----------

@router.get(
    "/fx-rate",
    response_model=FxRateResponse,
    summary="Get FX rate (via Wise)",
)
async def get_fx_rate(
    source: str,
    target: str,
    amount: Optional[Decimal] = None,
):
    """
    Example:
    GET /payments/fx-rate?source=BRL&target=USD&amount=100
    """
    client = WiseClient()
    try:
        rate = await client.get_rate(source, target)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Wise rate error: {e}")

    target_amount = None
    if amount is not None:
        target_amount = (amount * rate).quantize(Decimal("0.01"))

    return FxRateResponse(
        source=source.upper(),
        target=target.upper(),
        rate=rate,
        source_amount=amount,
        target_amount=target_amount,
    )


@router.post(
    "/transfer/sandbox",
    response_model=SandboxTransferResponse,
    summary="Simulate FX transfer (sandbox)",
)
async def sandbox_transfer(
    payload: SandboxTransferRequest,
    db: Session = Depends(get_db),
):
    """
    Simulated transfer:
    - Validates user + account
    - Fetches rate & quote from Wise
    - Stores a Transaction row with type='fx_sandbox'
    """

    # 1) Check user + account exist
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    account = (
        db.query(models.Account)
        .filter(
            models.Account.id == payload.account_id,
            models.Account.user_id == payload.user_id,
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found for user")

    client = WiseClient()

    # 2) Get rate
    try:
        rate = await client.get_rate(payload.source_currency, payload.target_currency)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Wise rate error: {e}")

    # 3) Get sandbox quote snapshot (for front-end display, no real transfer yet)
    try:
        quote_json = await client.create_sandbox_quote(
            source_currency=payload.source_currency,
            target_currency=payload.target_currency,
            source_amount=payload.source_amount,
        )
    except Exception as e:
        # Quote is optional; we still want a rate
        quote_json = {"error": str(e)}

    estimated_target_amount = (payload.source_amount * rate).quantize(Decimal("0.01"))

    # 4) Log as sandbox transaction (no real money movement)
    tx = models.Transaction(
        user_id=payload.user_id,
        account_id=payload.account_id,
        type="fx_sandbox",
        amount=payload.source_amount,
        currency=payload.source_currency.upper(),
    )
    db.add(tx)
    db.commit()

    return SandboxTransferResponse(
        user_id=payload.user_id,
        account_id=payload.account_id,
        source_currency=payload.source_currency.upper(),
        target_currency=payload.target_currency.upper(),
        source_amount=payload.source_amount,
        estimated_target_amount=estimated_target_amount,
        fx_rate=rate,
        wise_quote_snapshot=quote_json,
    )
