# app/routers/kyc.py
"""
Paused for current product direction.

This router supports the older Orryin fintech onboarding flow:
- Sumsub KYC applicant creation
- KYC status retrieval
- Sumsub webhook handling

It is intentionally kept in the codebase for future reuse,
but it is NOT mounted in app/main.py for the current
market-intelligence / prediction-simulation pivot.
"""

from __future__ import annotations

import re
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.models.kyc import KycStatus
from app.integrations.sumsub_client import SumsubClient
from app.integrations.sumsub_webhook import verify_sumsub_webhook_signature

router = APIRouter()


# ---------- Pydantic Schemas ----------

class KycApplicantCreate(BaseModel):
    user_id: int
    email: EmailStr
    first_name: str
    last_name: str
    country: str


class KycApplicantResponse(BaseModel):
    applicant_id: Optional[str] = None
    status: str
    review_result: Optional[str] = None


class KycStatusResponse(BaseModel):
    user_id: int
    applicant_id: Optional[str] = None
    status: str
    review_result: Optional[str] = None


# ---------- Helpers ----------

def _extract_applicant_id_from_sumsub_409(description: str) -> Optional[str]:
    """
    Sumsub 409 description usually looks like:
    "Applicant with external user id 'user-49' already exists: 695b2a5fd78655e152921a6c"
    """
    if not description:
        return None

    m = re.search(r"already exists:\s*([a-zA-Z0-9]+)\s*$", description.strip())
    if m:
        return m.group(1)

    parts = re.findall(r"[a-zA-Z0-9]+", description)
    return parts[-1] if parts else None


# ---------- API Endpoints ----------

@router.get(
    "/status",
    response_model=KycStatusResponse,
    summary="Get KYC status for a user",
)
def get_kyc_status(
    user_id: int = Query(..., description="User id"),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    kyc = db.query(KycStatus).filter(KycStatus.user_id == user_id).first()
    if not kyc:
        return KycStatusResponse(
            user_id=user_id,
            applicant_id=None,
            status="not_started",
            review_result=None,
        )

    return KycStatusResponse(
        user_id=user_id,
        applicant_id=kyc.sumsub_applicant_id,
        status=kyc.status,
        review_result=kyc.review_result,
    )


@router.post(
    "/applicant",
    response_model=KycApplicantResponse,
    summary="Create Sumsub applicant (idempotent)",
)
async def create_applicant(payload: KycApplicantCreate, db: Session = Depends(get_db)):
    """
    Idempotent behavior:
    - If KYC record exists for user_id, return it (no new Sumsub call).
    - If Sumsub returns 409 already exists, treat as success and return applicant_id.
    """
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    external_user_id = f"user-{payload.user_id}"

    existing = db.query(KycStatus).filter(KycStatus.user_id == payload.user_id).first()
    if existing and existing.sumsub_applicant_id:
        return KycApplicantResponse(
            applicant_id=existing.sumsub_applicant_id,
            status=existing.status or "already_exists",
            review_result=existing.review_result,
        )

    client = SumsubClient()

    sumsub_payload = {
        "externalUserId": external_user_id,
        "email": str(payload.email),
        "info": {
            "firstName": payload.first_name,
            "lastName": payload.last_name,
            "country": payload.country,
        },
    }

    applicant_id: Optional[str] = None
    out_status: str = "created"

    try:
        resp_json = await client.create_applicant(
            external_user_id=external_user_id,
            payload=sumsub_payload,
        )
        applicant_id = resp_json.get("id")
        if not applicant_id:
            raise HTTPException(status_code=500, detail="Sumsub did not return applicant id")
        out_status = "created"

    except httpx.HTTPStatusError as e:
        code = getattr(e.response, "status_code", None)

        if code == 409:
            try:
                body = e.response.json()
            except Exception:
                body = {"description": str(e)}

            desc = body.get("description", "") if isinstance(body, dict) else str(body)
            parsed_id = _extract_applicant_id_from_sumsub_409(desc)

            if not parsed_id:
                raise HTTPException(
                    status_code=502,
                    detail=f"Sumsub 409 but could not parse applicant id. Raw: {body}",
                )

            applicant_id = parsed_id
            out_status = "already_exists"
        else:
            raise HTTPException(status_code=502, detail=f"Sumsub error: {e}")

    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sumsub error: {e}")

    # Upsert KYC row (and satisfy NOT NULL external_user_id)
    existing = db.query(KycStatus).filter(KycStatus.user_id == payload.user_id).first()
    if existing:
        existing.external_user_id = external_user_id
        existing.sumsub_applicant_id = applicant_id
        existing.status = out_status
    else:
        kyc = KycStatus(
            user_id=payload.user_id,
            external_user_id=external_user_id,
            sumsub_applicant_id=applicant_id,
            status=out_status,
        )
        db.add(kyc)

    db.commit()

    # Re-read for response (safe and simple)
    saved = db.query(KycStatus).filter(KycStatus.user_id == payload.user_id).first()

    return KycApplicantResponse(
        applicant_id=saved.sumsub_applicant_id if saved else applicant_id,
        status=saved.status if saved else out_status,
        review_result=saved.review_result if saved else None,
    )


@router.post("/webhook/sumsub", status_code=status.HTTP_200_OK)
async def sumsub_webhook(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()
    header_sig = request.headers.get("X-Signature")  # adjust name if needed

    if not verify_sumsub_webhook_signature(raw_body, header_sig):
        # dev: don't hard fail
        pass

    data = await request.json()
    event_type = data.get("type")
    payload = data.get("data", {}) or {}

    applicant_id = payload.get("applicantId")
    if not applicant_id:
        return {"status": "ignored", "reason": "no applicantId"}

    new_status = None
    review_result = None

    if event_type == "applicantReviewed":
        review = payload.get("reviewResult", {})
        review_status = review.get("reviewStatus")
        review_answer = review.get("reviewAnswer")
        review_result = f"{review_status}:{review_answer}"

        if review_answer == "GREEN":
            new_status = "approved"
        elif review_answer == "RED":
            new_status = "rejected"
        else:
            new_status = "pending"
    else:
        new_status = "pending"

    kyc = db.query(KycStatus).filter(KycStatus.sumsub_applicant_id == applicant_id).first()
    if not kyc:
        return {"status": "ignored", "reason": "KYC record not found"}

    kyc.status = new_status
    if review_result:
        kyc.review_result = review_result

    db.commit()
    return {"status": "ok"}
