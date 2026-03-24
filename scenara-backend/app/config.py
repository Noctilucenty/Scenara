from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ---------- App ----------
    app_env: str = "dev"
    app_name: str = "Orryin Backend"
    app_debug: bool = True

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

    # ---------- CORS ----------
    cors_allow_origins: str = (
        "http://localhost:8081,"
        "http://127.0.0.1:8081,"
        "http://localhost:19006,"
        "http://127.0.0.1:19006"
    )

    # ---------- Config ----------
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()