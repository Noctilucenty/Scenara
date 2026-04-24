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

    # ---------- Google Translate ----------
    google_translate_api_key: str | None = None

    # ---------- Observability (Sentry) ----------
    # Set SENTRY_DSN env var to enable error reporting. Leave unset to disable entirely.
    # Release tag defaults to the Render git commit SHA when deployed, falling back to "local".
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1  # 10% APM sampling to stay within free tier
    sentry_profiles_sample_rate: float = 0.1

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