# Orryin Backend — MVP v1

[![FastAPI](https://img.shields.io/badge/FastAPI-0.1.0-009688?logo=fastapi&logoColor=white)](#)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-TBD-lightgrey)](#)

Backend MVP that validates Orryin’s end-to-end flow for cross-border investing infrastructure:
Users → KYC (Sumsub) → FX (Wise sandbox) → Brokerage (DriveWealth mock).

MVP intent: system validation and integration scaffolding. This backend is not production-ready.

---

## What this MVP proves

- User and cash account creation
- Idempotent Sumsub applicant creation (handles 409 already-exists)
- KYC status fetch endpoint for app UI
- Wise FX rate fetch and sandbox transfer simulation
- DriveWealth onboarding (mock) and account persistence
- One-call system test returning a unified JSON snapshot

---

## Tech stack

- FastAPI
- SQLAlchemy 2.0
- Pydantic v2
- SQLite (dev only, auto-creates tables on startup)
- httpx for external API calls

---

## Repo structure

```
orryin-backend/
  app/
    main.py                 # FastAPI app + SQLite dev table init
    config.py               # settings (loads env vars)
    db.py                   # SQLAlchemy engine/session/base
    models/                 # ORM tables
    routers/                # API routes
    integrations/           # Sumsub/Wise/DriveWealth clients
  .env                      # local dev (DO NOT commit)
  requirements.txt / pyproject.toml
```

---

## Quickstart (local)

### 1) Create virtual environment and install dependencies

```bash
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

### 2) Configure environment

Create a `.env` file in the repo root:

```env
DB_URL=sqlite:///./orryin_dev.db
DB_ECHO=false

SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_LEVEL_NAME=basic-kyc-level
SUMSUB_APP_TOKEN=your_token
SUMSUB_SECRET_KEY=your_secret

WISE_BASE_URL=https://api.sandbox.transferwise.tech
WISE_API_TOKEN=your_token

DRIVEWEALTH_BASE_URL=https://mock.local
DRIVEWEALTH_API_TOKEN=mock
```

Do not commit `.env`, database files, or `.venv/`. Use `.gitignore`.

### 3) Run the server

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Swagger UI:
http://127.0.0.1:8000/docs

---

## System test endpoint (one-call validation)

### POST /mvp/test-flow

This endpoint is a destructive system-test endpoint.

Behavior:
- Creates a new user on every call
- Creates a new cash account on every call
- Runs KYC initiation (idempotent)
- Fetches FX rate and simulates funding
- Creates a mock brokerage account
- Returns a unified JSON snapshot

Intended use:
- Backend verification
- Frontend integration testing
- Demo and validation

Not intended for:
- Reuse with the same user
- Production logic
- Persistent user sessions

Repeated calls will grow the database. This is expected for MVP v1.

---

## Key KYC endpoints

- POST /kyc/applicant — create applicant (idempotent, 409-safe)
- GET /kyc/status?user_id=<id> — fetch current KYC status for UI
- POST /kyc/webhook/sumsub — webhook to update approval state

Idempotent logic:
- If a KYC row exists for a user, it is returned without calling Sumsub.
- If Sumsub returns 409 already exists, the response is treated as success and the applicant_id is parsed and stored.

---

## FX and funding notes

FX and funding endpoints simulate Wise-like behavior.

Known limitation:
The sandbox transfer endpoint may return an error such as:

"WiseClient object has no attribute 'create_sandbox_quote'"

This is expected in MVP v1 and does not block:
- Frontend testing
- End-to-end flow validation
- Demo execution

FX rates and estimated target amounts are still returned correctly.

---

## Database notes

- SQLite is used for development only.
- Tables auto-create on startup when DB_URL points to SQLite.
- Production requires PostgreSQL and proper migrations (Alembic).

---

## Troubleshooting

### 409 applicant already exists
Expected behavior. The backend treats this as success and returns status=already_exists.

### Uvicorn unable to create process on Windows
Usually caused by a broken or recreated virtual environment.

Fix:
1) deactivate
2) re-activate the virtual environment
3) run `python -m uvicorn app.main:app --reload`

---

## Security and compliance reminder

This MVP references regulated workflows (KYC/AML) but does not implement production-grade security:
- no hardened authentication
- no encryption-at-rest strategy
- no audit logs
- no rate limiting or abuse protection
- no secrets management

---

## Status

- Backend MVP v1 complete
- Frontend integration in progress
- PostgreSQL and migrations pending
- Production hardening pending

---

## License

MIT License

