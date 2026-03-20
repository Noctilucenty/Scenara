# app/integrations/sumsub_webhook.py
import hashlib
import hmac
from typing import Optional

from app.config import settings


def verify_sumsub_webhook_signature(raw_body: bytes, header_signature: Optional[str]) -> bool:
    """
    Verify Sumsub webhook HMAC signature.
    In real setup, Sumsub docs specify the exact header (e.g. X-Signature),
    we’ll assume `X-Signature` for now.
    """
    secret = (settings.sumsub_webhook_secret or settings.sumsub_secret_key or "").encode("utf-8")
    if not secret or not header_signature:
        # For development you might skip strict verification,
        # but in production ALWAYS validate.
        return False

    expected_sig = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    # Some providers prefix with "sha256="; handle both cases
    header_signature = header_signature.replace("sha256=", "")
    return hmac.compare_digest(expected_sig, header_signature)
