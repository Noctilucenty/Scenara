# app/routers/mvp.py

"""
Paused for current product direction.

This router was built for the older Orryin backend MVP flow:
- dev user creation
- dev account creation
- Sumsub KYC
- Wise FX sandbox
- DriveWealth brokerage onboarding

It is intentionally kept for reference and possible future reuse,
but it is NOT mounted in app/main.py for the current
market-intelligence / prediction-simulation pivot.
"""


from __future__ import annotations

import re
import uuid
from decimal import Decimal
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, ConfigDict
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.models.kyc import KycStatus
from app.integrations.sumsub_client import SumsubClient
from app.integrations.wise_client import WiseClient
from app.integrations.drivewealth_client import DriveWealthClient

router = APIRouter()


# ---------- Helpers ----------

def _extract_applicant_id_from_sumsub_409(description: str) -> Optional[str]:
    if not description:
        return None
    m = re.search(r"already exists:\s*([a-zA-Z0-9]+)\s*$", description.strip())
    if m:
        return m.group(1)
    parts = re.findall(r"[a-zA-Z0-9]+", description)
    return parts[-1] if parts else None


# ---------- Response Schemas ----------

class FlowUser(BaseModel):
    id: int
    email: EmailStr
    model_config = ConfigDict(from_attributes=True)


class FlowAccount(BaseModel):
    id: int
    currency: str
    model_config = ConfigDict(from_attributes=True)


class FlowKyc(BaseModel):
    applicant_id: Optional[str] = None
    status: str
    error: Optional[str] = None


class FlowPayments(BaseModel):
    source_currency: Optional[str] = None
    target_currency: Optional[str] = None
    source_amount: Optional[Decimal] = None
    fx_rate: Optional[Decimal] = None
    estimated_target_amount: Optional[Decimal] = None
    error: Optional[str] = None


class FlowBrokerage(BaseModel):
    external_customer_id: Optional[str] = None
    external_account_id: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None


class MVPFlowResponse(BaseModel):
    user: FlowUser
    account: FlowAccount
    kyc: FlowKyc
    payments: FlowPayments
    brokerage: FlowBrokerage


# ---------- Main Day 5 Endpoint ----------

@router.post(
    "/test-flow",
    response_model=MVPFlowResponse,
    summary="Run full backend MVP flow (Day 5 system test)",
)
async def test_mvp_flow(db: Session = Depends(get_db)):
    """
    Day 5 – System Test (Backend MVP Flow v1)
    """

    # ---------- 1) Create dev user ----------
    email = f"mvp+{uuid.uuid4().hex[:8]}@example.com"
    user = models.User(
        email=email,
        hashed_password="dev-mvp-flow",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # ---------- 2) Create dev account ----------
    account = models.Account(
        user_id=user.id,
        currency="USD",
        balance=0,
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    # ---------- 3) KYC (Sumsub, idempotent) ----------
    kyc_status_str = "skipped"
    kyc_applicant_id: Optional[str] = None
    kyc_error: Optional[str] = None

    external_user_id = f"user-{user.id}"

    try:
        # If already exists in DB, don't call Sumsub
        existing = db.query(KycStatus).filter(KycStatus.user_id == user.id).first()
        if existing and existing.sumsub_applicant_id:
            kyc_applicant_id = existing.sumsub_applicant_id
            kyc_status_str = existing.status or "already_exists"
        else:
            sumsub_client = SumsubClient()
            sumsub_payload: Dict[str, Any] = {
                "externalUserId": external_user_id,
                "email": user.email,
                "info": {
                    "firstName": "Leon",
                    "lastName": "Test",
                    "country": "BRA",
                },
            }

            out_status = "created"
            applicant_id: Optional[str] = None

            try:
                resp_json = await sumsub_client.create_applicant(
                    external_user_id=external_user_id,
                    payload=sumsub_payload,
                )
                applicant_id = resp_json.get("id")
                if not applicant_id:
                    raise RuntimeError("Sumsub did not return applicant id")
                out_status = "created"
            except httpx.HTTPStatusError as e:
                if e.response is not None and e.response.status_code == 409:
                    try:
                        body = e.response.json()
                    except Exception:
                        body = {"description": str(e)}

                    desc = body.get("description", "") if isinstance(body, dict) else str(body)
                    parsed = _extract_applicant_id_from_sumsub_409(desc)
                    if not parsed:
                        raise RuntimeError(f"Sumsub 409 but could not parse applicant id: {body}")
                    applicant_id = parsed
                    out_status = "already_exists"
                else:
                    raise

            # Upsert DB row (and satisfy NOT NULL external_user_id)
            existing = db.query(KycStatus).filter(KycStatus.user_id == user.id).first()
            if existing:
                existing.external_user_id = external_user_id
                existing.sumsub_applicant_id = applicant_id
                existing.status = out_status
            else:
                db.add(
                    KycStatus(
                        user_id=user.id,
                        external_user_id=external_user_id,
                        sumsub_applicant_id=applicant_id,
                        status=out_status,
                    )
                )

            db.commit()

            kyc_applicant_id = applicant_id
            kyc_status_str = out_status

    except RuntimeError as e:
        kyc_status_str = "error"
        kyc_error = f"Config/flow error: {e}"
    except Exception as e:
        kyc_status_str = "error"
        kyc_error = f"Sumsub error: {e}"

    # ---------- 4) Payments (Wise FX sandbox) ----------
    pay_source = "BRL"
    pay_target = "USD"
    pay_source_amount = Decimal("100")

    fx_rate: Optional[Decimal] = None
    est_target: Optional[Decimal] = None
    payments_error: Optional[str] = None

    try:
        wise_client = WiseClient()
        fx_rate = await wise_client.get_rate(pay_source, pay_target)
        est_target = (pay_source_amount * fx_rate).quantize(Decimal("0.01"))

        try:
            await wise_client.create_sandbox_quote(
                source_currency=pay_source,
                target_currency=pay_target,
                source_amount=pay_source_amount,
            )
        except Exception:
            pass

        tx = models.Transaction(
            user_id=user.id,
            account_id=account.id,
            type="fx_sandbox",
            amount=pay_source_amount,
            currency=pay_source,
        )
        db.add(tx)
        db.commit()
    except RuntimeError as e:
        payments_error = f"Config error: {e}"
    except Exception as e:
        payments_error = f"Wise error: {e}"

    # ---------- 5) Brokerage (DriveWealth mock) ----------
    brokerage_external_customer_id: Optional[str] = None
    brokerage_external_account_id: Optional[str] = None
    brokerage_status: Optional[str] = None
    brokerage_error: Optional[str] = None

    try:
        dw_client = DriveWealthClient()
        customer = await dw_client.create_customer(
            user_id=user.id,
            email=user.email,
        )
        account_dw = await dw_client.create_account(
            customer_id=customer.id,
            base_currency="USD",
        )

        brokerage = models.BrokerageAccount(
            user_id=user.id,
            broker="drivewealth",
            external_customer_id=customer.id,
            external_account_id=account_dw.id,
            status="created",
        )
        db.add(brokerage)
        db.commit()
        db.refresh(brokerage)

        brokerage_external_customer_id = brokerage.external_customer_id
        brokerage_external_account_id = brokerage.external_account_id
        brokerage_status = brokerage.status
    except RuntimeError as e:
        brokerage_error = f"Config error: {e}"
    except Exception as e:
        brokerage_error = f"DriveWealth error: {e}"

    return MVPFlowResponse(
        user=FlowUser.from_orm(user),
        account=FlowAccount.from_orm(account),
        kyc=FlowKyc(applicant_id=kyc_applicant_id, status=kyc_status_str, error=kyc_error),
        payments=FlowPayments(
            source_currency=pay_source,
            target_currency=pay_target,
            source_amount=pay_source_amount,
            fx_rate=fx_rate,
            estimated_target_amount=est_target,
            error=payments_error,
        ),
        brokerage=FlowBrokerage(
            external_customer_id=brokerage_external_customer_id,
            external_account_id=brokerage_external_account_id,
            status=brokerage_status,
            error=brokerage_error,
        ),
    )
