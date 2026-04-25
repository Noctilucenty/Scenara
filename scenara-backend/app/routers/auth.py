"""
app/routers/auth.py

Handles user registration, login, and JWT token management.

Endpoints:
  POST /auth/register  — create new user + simulation account, return JWT
  POST /auth/login     — verify credentials, return JWT
  GET  /auth/me        — return current user from JWT
"""

from __future__ import annotations

import hashlib
import random
import string
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.models.account import Account
from app.config import settings
from app.services.email import send_reset_code

router = APIRouter()

# ── JWT config ────────────────────────────────────────────────────────────────
SECRET_KEY = settings.jwt_secret_key  # loaded from JWT_SECRET_KEY env var
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# ── Password hashing ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── OAuth2 scheme ─────────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login/token", auto_error=False)

STARTING_BALANCE = 10_000.00


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=100)
    display_name: str = Field(..., min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    display_name: str
    balance: float
    daily_bonus: bool = False
    streak_days: int = 0


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    is_active: bool
    current_streak: int
    best_streak: int
    created_at: datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    user_id = int(payload.get("sub", 0))
    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Tag the Sentry scope so any subsequent error in this request is linked
    # to the user. No-op when Sentry is disabled.
    try:
        from app.observability import set_user_context
        set_user_context(user.id, user.email)
    except Exception:
        pass
    return user


def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Returns user if token valid, None otherwise. Use for optional auth."""
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub", 0))
        user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
        if user:
            try:
                from app.observability import set_user_context
                set_user_context(user.id, user.email)
            except Exception:
                pass
        return user
    except Exception:
        return None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user, create simulation account, return JWT."""

    # Check email not taken
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        is_active=True,
        current_streak=0,
        best_streak=0,
    )
    db.add(user)
    db.flush()

    # Create simulation account with starting balance
    account = Account(
        user_id=user.id,
        account_type="simulation",
        currency="USD",
        balance=STARTING_BALANCE,
        is_active=True,
    )
    db.add(account)
    db.commit()
    db.refresh(user)
    db.refresh(account)

    token = create_access_token(user.id, user.email)

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        balance=float(account.balance),
    )


DAILY_BONUS_AMOUNT = 50.0
DAILY_BONUS_COOLDOWN_HOURS = 24


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Login with email + password, return JWT."""

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is inactive")

    account = db.query(Account).filter(
        Account.user_id == user.id,
        Account.account_type == "simulation",
        Account.is_active.is_(True),
    ).first()

    # Daily login bonus: award $50 if last login was > 24 hours ago (or never)
    daily_bonus = False
    now = datetime.utcnow()
    if user.last_login_at is None or (now - user.last_login_at) > timedelta(hours=DAILY_BONUS_COOLDOWN_HOURS):
        if account:
            account.balance = float(account.balance) + DAILY_BONUS_AMOUNT
        daily_bonus = True

    user.last_login_at = now
    db.commit()
    if account:
        db.refresh(account)

    balance = float(account.balance) if account else 0.0
    token = create_access_token(user.id, user.email)

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        balance=balance,
        daily_bonus=daily_bonus,
        streak_days=user.current_streak or 0,
    )


@router.post("/login/token")
def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 compatible form login (for Swagger UI)."""
    user = db.query(User).filter(User.email == form_data.username.lower()).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user.id, user.email)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user."""
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        is_active=current_user.is_active,
        current_streak=current_user.current_streak,
        best_streak=current_user.best_streak,
        created_at=current_user.created_at,
    )


@router.post("/logout")
def logout():
    """Client should delete the token. Nothing to do server-side for JWT."""
    return {"ok": True, "message": "Logged out — delete your token client-side"}


# ── Password reset (OTP flow) ─────────────────────────────────────────────────
#
# Three steps:
#   1. POST /auth/forgot-password  { email }          → 200 always (no user enumeration)
#   2. POST /auth/verify-reset-code { email, code }   → { reset_token } or 400
#   3. POST /auth/reset-password   { reset_token, new_password } → 200

OTP_EXPIRE_MINUTES = 15
RESET_TOKEN_EXPIRE_MINUTES = 20  # slightly longer than OTP so the user has time to type


class ForgotPasswordRequest(BaseModel):
    email: str


class VerifyCodeRequest(BaseModel):
    email: str
    code: str


class VerifyCodeResponse(BaseModel):
    reset_token: str  # short-lived JWT with purpose="password_reset"


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str = Field(..., min_length=6, max_length=100)


def _hash_otp(code: str) -> str:
    """SHA-256 hex digest. Fast enough for OTPs (unlike bcrypt, which is slow by design)."""
    return hashlib.sha256(code.encode()).hexdigest()


def _generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def _create_reset_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "purpose": "password_reset", "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM,
    )


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Step 1: generate + email a 6-digit OTP.
    Always returns 200 — never reveals whether the email is registered.
    """
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user and user.is_active:
        code = _generate_otp()
        user.reset_code_hash = _hash_otp(code)
        user.reset_code_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
        db.commit()
        send_reset_code(user.email, code)  # fire-and-forget; SMTP errors logged not raised
    return {"ok": True, "message": "If that email is registered, a code is on its way."}


@router.post("/verify-reset-code", response_model=VerifyCodeResponse)
def verify_reset_code(payload: VerifyCodeRequest, db: Session = Depends(get_db)):
    """
    Step 2: validate the OTP. Returns a short-lived reset_token JWT on success.
    On failure (wrong code, expired, no pending reset) returns 400.
    The same response shape is returned for all failures to prevent enumeration.
    """
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    invalid = (
        user is None
        or not user.is_active
        or user.reset_code_hash is None
        or user.reset_code_expires_at is None
        or datetime.utcnow() > user.reset_code_expires_at
        or user.reset_code_hash != _hash_otp(payload.code.strip())
    )
    if invalid:
        raise HTTPException(status_code=400, detail="Invalid or expired code.")

    # Invalidate the OTP so it can't be reused (even within the expiry window).
    user.reset_code_hash = None
    user.reset_code_expires_at = None
    db.commit()

    return VerifyCodeResponse(reset_token=_create_reset_token(user.id))


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Step 3: set a new password using the reset_token from step 2.
    The reset_token is a JWT with purpose="password_reset".
    """
    try:
        claims = jwt.decode(payload.reset_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    if claims.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid token purpose.")

    user_id = int(claims.get("sub", 0))
    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")

    user.hashed_password = hash_password(payload.new_password)
    # Clear any leftover reset state just in case
    user.reset_code_hash = None
    user.reset_code_expires_at = None
    db.commit()

    return {"ok": True, "message": "Password updated. You can now sign in."}