"""
app/services/email.py

Thin SMTP wrapper for transactional email.

When SMTP_HOST is set, sends real email via STARTTLS. When unset (local dev),
logs the message to the console so you can copy the OTP without an inbox.
Uses smtplib from the standard library — no extra dependencies.

Usage:
    from app.services.email import send_reset_code
    send_reset_code(to_email="user@example.com", code="381924")
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
    """
    Send a transactional email.
    Returns True on success, False on any failure.
    Falls back to console-log when SMTP is not configured.
    """
    if not settings.smtp_host:
        # Dev mode: print so the developer can paste the OTP without a real inbox.
        logger.info(
            "[Email/dev] To: %s | Subject: %s\n%s",
            to, subject, body_text,
        )
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = settings.smtp_from
    msg["To"]      = to
    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
            s.ehlo()
            s.starttls()
            if settings.smtp_user and settings.smtp_password:
                s.login(settings.smtp_user, settings.smtp_password)
            s.sendmail(settings.smtp_from, [to], msg.as_string())
        logger.info("[Email] Sent '%s' to %s", subject, to)
        return True
    except Exception as e:
        logger.error("[Email] Failed to send to %s: %s", to, e)
        return False


# ── Domain helpers ────────────────────────────────────────────────────────────

def send_reset_code(to_email: str, code: str) -> bool:
    """Email the 6-digit password reset OTP."""
    subject = "Your Scenara reset code"
    text = (
        f"Your Scenara password reset code is: {code}\n\n"
        f"This code expires in 15 minutes. If you didn't request a reset, ignore this email.\n\n"
        f"— The Scenara team"
    )
    html = f"""
<html><body style="font-family:sans-serif;background:#08090C;color:#F1F5F9;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#0D1117;border-radius:16px;padding:32px;border:1px solid rgba(124,92,252,0.2)">
    <h2 style="color:#7C5CFC;margin-top:0">scenara</h2>
    <p style="font-size:15px;line-height:1.6">Enter this code to reset your password:</p>
    <div style="background:#08090C;border-radius:12px;padding:20px;text-align:center;margin:24px 0;letter-spacing:8px;font-size:32px;font-weight:700;color:#F1F5F9;border:1px solid rgba(124,92,252,0.3)">
      {code}
    </div>
    <p style="color:#64748B;font-size:13px">Expires in <strong>15 minutes</strong>. If you didn't request this, ignore the email.</p>
  </div>
</body></html>
"""
    return send_email(to_email, subject, text, html)
