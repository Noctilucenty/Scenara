from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.db import get_db
from app import models

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


def fake_hash(password: str) -> str:
    return "fakehashed-" + password  # dev only


@router.post("/dev-create", response_model=UserOut)
def create_dev_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=payload.email,
        hashed_password=fake_hash(payload.password),
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
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).limit(50).all()