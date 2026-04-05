# app/integrations/sumsub_client.py
import hashlib
import hmac
import time
from typing import Any, Dict

import httpx

from app.config import settings


class SumsubClient:
    def __init__(self):
        if not settings.sumsub_app_token or not settings.sumsub_secret_key:
            raise RuntimeError("Sumsub credentials are not configured")

        self.app_token = settings.sumsub_app_token
        self.secret_key = settings.sumsub_secret_key.encode("utf-8")
        self.base_url = settings.sumsub_base_url.rstrip("/")

    def _sign_request(self, method: str, path: str, body: bytes = b"") -> Dict[str, str]:
        """
        Sumsub HMAC signature:
        X-App-Token, X-App-Access-Sig, X-App-Access-Ts
        """
        ts = str(int(time.time()))
        message = (ts + method.upper() + path).encode("utf-8") + body
        signature = hmac.new(self.secret_key, message, hashlib.sha256).hexdigest()

        return {
            "X-App-Token": self.app_token,
            "X-App-Access-Ts": ts,
            "X-App-Access-Sig": signature,
        }

    async def create_applicant(self, external_user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create Sumsub applicant:
        POST /resources/applicants?levelName=<levelName>
        """
        path = f"/resources/applicants?levelName={settings.sumsub_level_name}"
        url = self.base_url + path

        async with httpx.AsyncClient() as client:
            body = httpx.dumps(payload).encode("utf-8")
            headers = self._sign_request("POST", path, body)
            headers["Content-Type"] = "application/json"

            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
