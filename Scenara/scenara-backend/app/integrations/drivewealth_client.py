# app/integrations/drivewealth_client.py
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Dict

from app.config import settings


@dataclass
class DriveWealthCustomer:
    id: str


@dataclass
class DriveWealthAccount:
    id: str
    base_currency: str


class DriveWealthClient:
    """
    Thin wrapper around DriveWealth.

    For now we use a local mock so your backend works
    even without real credentials. When you're ready,
    you can replace the mock branches with real HTTP calls.
    """

    def __init__(self) -> None:
        self.base_url = settings.drivewealth_base_url.rstrip("/")
        self.app_key = settings.drivewealth_app_key
        self.app_secret = settings.drivewealth_app_secret
        self.use_mock = settings.drivewealth_use_mock

    async def create_customer(self, *, user_id: int, email: str) -> DriveWealthCustomer:
        """
        In real integration, this would call DriveWealth's customer creation API.

        For now: return a deterministic-looking UUID prefixed with 'DW-CUST-'.
        """
        if self.use_mock:
            fake_id = f"DW-CUST-{uuid.uuid4().hex[:20]}"
            return DriveWealthCustomer(id=fake_id)

        # ---------- REAL IMPLEMENTATION SKETCH (TODO) ----------
        # Here you'd do an async HTTP call using httpx, something like:
        #
        #   async with httpx.AsyncClient(base_url=self.base_url) as client:
        #       payload = {...}
        #       headers = {...auth using app_key/app_secret...}
        #       resp = await client.post("/v1/customers", json=payload, headers=headers)
        #       resp.raise_for_status()
        #       data = resp.json()
        #       return DriveWealthCustomer(id=data["id"])
        #
        # For now we just raise:
        raise NotImplementedError("DriveWealth real customer API not implemented")

    async def create_account(
        self, *, customer_id: str, base_currency: str = "USD"
    ) -> DriveWealthAccount:
        """
        In real integration, this would open a brokerage account for a customer.

        For now: return a mock account ID that looks stable.
        """
        if self.use_mock:
            fake_id = f"DW-ACC-{uuid.uuid4().hex[:20]}"
            return DriveWealthAccount(id=fake_id, base_currency=base_currency.upper())

        # ---------- REAL IMPLEMENTATION SKETCH (TODO) ----------
        raise NotImplementedError("DriveWealth real account API not implemented")
