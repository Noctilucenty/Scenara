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
    subject = f"{code} is your Scenara reset code"
    text = (
        f"Your Scenara password reset code is: {code}\n\n"
        f"Enter this code in the app to reset your password. "
        f"It expires in 15 minutes.\n\n"
        f"If you didn't request a password reset, you can safely ignore this email.\n\n"
        f"— The Scenara team"
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0D1117;border-radius:16px;overflow:hidden;border:1px solid rgba(124,92,252,0.2)">
        <!-- Header -->
        <tr><td style="background:linear-gradient(90deg,#4F8EF7,#7C5CFC,#F050AE);height:4px"></td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 36px 28px">
          <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#7C5CFC;letter-spacing:-0.5px">scenara</p>
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#F1F5F9">Password Reset Code</p>
          <p style="margin:0 0 28px;font-size:14px;color:#94A3B8;line-height:1.6">
            Use the code below to reset your Scenara password.
          </p>
          <!-- Code block -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="background:#08090C;border-radius:12px;border:1px solid rgba(124,92,252,0.35);padding:24px">
              <span style="font-size:38px;font-weight:700;color:#F1F5F9;letter-spacing:14px;font-family:monospace">{code}</span>
            </td></tr>
          </table>
          <p style="margin:20px 0 0;font-size:13px;color:#64748B;line-height:1.6;text-align:center">
            Expires in <strong style="color:#94A3B8">15 minutes</strong> &nbsp;·&nbsp;
            If you didn't request this, ignore this email.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 36px;border-top:1px solid rgba(255,255,255,0.06)">
          <p style="margin:0;font-size:12px;color:#475569">© {2025} Scenara. You're receiving this because a reset was requested for your account.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    ok = send_email(to_email, subject, text, html)
    if not ok:
        logger.error(
            "[Email] Failed to deliver reset code to %s. "
            "Check SMTP_HOST/SMTP_USER/SMTP_PASSWORD env vars on Render. "
            "For Gmail: use an App Password (not your regular password) and enable 2FA.",
            to_email,
        )
    return ok
