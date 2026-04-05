from __future__ import annotations

from decimal import Decimal
from typing import Any

import httpx

from app.config import settings


class WiseClient:
    def __init__(self) -> None:
        self.base_url = settings.wise_base_url.rstrip("/")
        self.api_key = settings.wise_api_key

        if not self.api_key:
            raise RuntimeError("WISE_API_KEY is not configured in your .env file")

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def get_rate(self, source: str, target: str) -> Decimal:
        params = {"source": source.upper(), "target": target.upper()}
        headers = self._auth_headers()

        async with httpx.AsyncClient(base_url=self.base_url, headers=headers, timeout=30.0) as client:
            resp = await client.get("/v1/rates", params=params)

            if resp.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"Wise error {resp.status_code}: {resp.text}",
                    request=resp.request,
                    response=resp,
                )

            data: Any = resp.json()

        if isinstance(data, list):
            return Decimal(str(data[0]["rate"]))
        return Decimal(str(data["rate"]))
