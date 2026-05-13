from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ---------- App ----------
    app_env: str = "dev"
    app_name: str = "Scenara Backend"
    app_debug: bool = True

    # ---------- Auth ----------
    jwt_secret_key: str = "CHANGE_ME_IN_PRODUCTION"

    # ---------- Database ----------
    database_url: str | None = None
    db_echo: bool = False

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        return "sqlite:///./orryin_dev.db"

    # ---------- Feature Flags (IMPORTANT) ----------
    enable_kyc: bool = False
    enable_payments: bool = False
    enable_brokerage: bool = False

    # ---------- Sumsub (optional / future) ----------
    sumsub_app_token: str | None = None
    sumsub_secret_key: str | None = None
    sumsub_base_url: str = "https://api.sumsub.com"
    sumsub_level_name: str = "basic-kyc-id-doc"

    # ---------- Wise (optional / future) ----------
    wise_api_key: str | None = None
    wise_base_url: str = "https://api.sandbox.transferwise.tech"
    wise_profile_id: str | None = None

    # ---------- DriveWealth (optional / future) ----------
    drivewealth_base_url: str = "https://api.drivewealth.io"
    drivewealth_app_key: str | None = None
    drivewealth_app_secret: str | None = None
    drivewealth_use_mock: bool = True

    # ---------- Translation (MyMemory) ----------
    # MyMemory is a free translation API.  No key required — but providing
    # an email raises the daily quota from ~1 000 to 50 000 words/day and
    # gives them a way to contact you if there's an issue with your traffic.
    # Set MYMEMORY_EMAIL on Render to any address you control.
    mymemory_email: str | None = None
    # Legacy Google Translate key — kept for backward compat, no longer used.
    # Safe to leave unset.
    google_translate_api_key: str | None = None

    # ---------- AI Auto-Resolver ----------
    gemini_api_key: str | None = None  # Free tier at aistudio.google.com

    # ---------- Observability (Sentry) ----------
    # Set SENTRY_DSN env var to enable error reporting. Leave unset to disable entirely.
    # Release tag defaults to the Render git commit SHA when deployed, falling back to "local".
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1  # 10% APM sampling to stay within free tier
    sentry_profiles_sample_rate: float = 0.1

    # ---------- Email (SMTP) ----------
    # Set these env vars on Render to enable transactional email.
    # Works with Gmail (smtp.gmail.com:587), Mailgun, SendGrid SMTP, etc.
    # Leave SMTP_HOST unset to disable email sending (code will be logged instead).
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@scenara.app"

    # ---------- Push notifications ----------
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_access_token: str | None = None
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str = "mailto:notifications@scenara.app"

    # ---------- CORS ----------
    # Default "*" allows all origins (safe for this app — JWT-protected, no real money).
    # On Render.com: set CORS_ALLOW_ORIGINS env var to "*" or a comma-separated list.
    cors_allow_origins: str = "*"

    # ---------- Config ----------
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()