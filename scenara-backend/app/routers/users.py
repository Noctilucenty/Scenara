from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.db import get_db
from app import models
from app.routers.auth import get_current_user, hash_password

router = APIRouter()


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    is_active: bool

    class Config:
        orm_mode = True


@router.post("/dev-create", response_model=UserOut)
def create_dev_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Admin-only: create a user account (uses real bcrypt hashing).
    Kept for seeding test environments — requires an authenticated admin.
    """
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=payload.email,
        hashed_password=hash_password(payload.password),  # real bcrypt — never plaintext
        is_active=True,
        current_streak=0,
        best_streak=0,
    )
    db.add(user)
    db.flush()

    simulation_account = models.Account(
        user_id=user.id,
        currency="USD",
        balance=Decimal("10000.00"),
        account_type="simulation",
        is_active=True,
    )
    db.add(simulation_account)
    db.flush()

    seed_transaction = models.Transaction(
        user_id=user.id,
        account_id=simulation_account.id,
        type="seed",
        amount=Decimal("10000.00"),
        currency="USD",
    )
    db.add(seed_transaction)

    db.commit()
    db.refresh(user)
    return user


@router.get("/", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Admin-only: list users (never exposed to regular users)."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return db.query(models.User).limit(50).all()