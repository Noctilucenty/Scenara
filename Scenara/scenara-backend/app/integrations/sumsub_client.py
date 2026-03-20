from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Dict

import httpx

from app.config import settings


class SumsubClient:
    """
    Thin wrapper around Sumsub API.
    Supports: Create Applicant
    """

    def __init__(self) -> None:
        if not settings.sumsub_app_token or not settings.sumsub_secret_key:
            raise RuntimeError("Sumsub credentials are not configured")

        self.app_token = settings.sumsub_app_token
        self.secret_key = settings.sumsub_secret_key.encode("utf-8")
        self.base_url = settings.sumsub_base_url.rstrip("/")

    def _sign_request(self, method: str, path: str, body: bytes = b"") -> Dict[str, str]:
        ts = str(int(time.time()))
        message = (ts + method.upper() + path).encode("utf-8") + body
        signature = hmac.new(self.secret_key, message, hashlib.sha256).hexdigest()

        return {
            "X-App-Token": self.app_token,
            "X-App-Access-Ts": ts,
            "X-App-Access-Sig": signature,
        }

    async def create_applicant(
        self, external_user_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        POST /resources/applicants?levelName=<level>
        """
        # Sumsub expects this field
        payload = {**payload, "externalUserId": external_user_id}

        path = f"/resources/applicants?levelName={settings.sumsub_level_name}"
        url = self.base_url + path

        # IMPORTANT: deterministic JSON for signing
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

        headers = self._sign_request("POST", path, body)
        headers["Content-Type"] = "application/json"
        headers["Accept"] = "application/json"

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, content=body)

            if resp.status_code >= 400:
                raise httpx.HTTPStatusError(
                    f"Sumsub error {resp.status_code}: {resp.text}",
                    request=resp.request,
                    response=resp,
                )

            return resp.json()
