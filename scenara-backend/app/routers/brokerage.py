# app/routers/brokerage.py

"""
Paused for current product direction.

This router supports the older Orryin fintech flow:
- DriveWealth customer creation
- brokerage account onboarding
- brokerage account listing

It is intentionally kept for future reuse,
but it is NOT mounted in app/main.py for the current
market-intelligence / prediction-simulation pivot.
"""


from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.models.brokerage import BrokerageAccount
from app.integrations.drivewealth_client import DriveWealthClient

router = APIRouter()


# ---------- Schemas ----------

class BrokerageOnboardRequest(BaseModel):
    user_id: int
    base_currency: str = "USD"


class BrokerageAccountOut(BaseModel):
    id: int
    user_id: int
    broker: str
    external_customer_id: str
    external_account_id: str
    status: str

    class Config:
        orm_mode = True


class BrokerageOnboardResponse(BaseModel):
    user_id: int
    broker: str
    external_customer_id: str
    external_account_id: str
    status: str


# ---------- Endpoints ----------


@router.post(
    "/onboard",
    response_model=BrokerageOnboardResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or fetch DriveWealth brokerage account for a user",
)
async def onboard_brokerage(
    payload: BrokerageOnboardRequest,
    db: Session = Depends(get_db),
):
    """
    Brokerage onboarding flow (v1):

    1. Ensure user exists.
    2. If a DriveWealth brokerage account already exists, return it.
    3. Otherwise:
       - Create DriveWealth customer (mocked for now).
       - Create DriveWealth account (mocked for now).
       - Store them in brokerage_accounts table.
    """

    # 1) Make sure user exists
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2) If brokerage already exists for this user, return it
    existing = (
        db.query(BrokerageAccount)
        .filter(
            BrokerageAccount.user_id == payload.user_id,
            BrokerageAccount.broker == "drivewealth",
        )
        .order_by(BrokerageAccount.id.desc())
        .first()
    )

    if existing:
        return BrokerageOnboardResponse(
            user_id=existing.user_id,
            broker=existing.broker,
            external_customer_id=existing.external_customer_id,
            external_account_id=existing.external_account_id,
            status=existing.status,
        )

    client = DriveWealthClient()

    # 3a) Create customer at DriveWealth (mock for now)
    try:
        customer = await client.create_customer(
            user_id=payload.user_id,
            email=user.email,
        )
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"DriveWealth customer error: {e}")

    # 3b) Create brokerage account
    try:
        account = await client.create_account(
            customer_id=customer.id,
            base_currency=payload.base_currency,
        )
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"DriveWealth account error: {e}")

    # 3c) Persist in DB
    brokerage = BrokerageAccount(
        user_id=payload.user_id,
        broker="drivewealth",
        external_customer_id=customer.id,
        external_account_id=account.id,
        status="created",
    )
    db.add(brokerage)
    db.commit()
    db.refresh(brokerage)

    return BrokerageOnboardResponse(
        user_id=brokerage.user_id,
        broker=brokerage.broker,
        external_customer_id=brokerage.external_customer_id,
        external_account_id=brokerage.external_account_id,
        status=brokerage.status,
    )


@router.get(
    "/accounts/{user_id}",
    response_model=List[BrokerageAccountOut],
    summary="List brokerage accounts for a user",
)
def list_brokerage_accounts(
    user_id: int,
    db: Session = Depends(get_db),
):
    """
    Simple helper to see all brokerage accounts for a given user.
    """
    accounts = (
        db.query(BrokerageAccount)
        .filter(BrokerageAccount.user_id == user_id)
        .order_by(BrokerageAccount.id.asc())
        .all()
    )
    return accounts
