from enum import StrEnum
from functools import lru_cache

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    development = "development"
    staging = "staging"
    production = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    app_name: str = "Crib"
    environment: Environment = Environment.development
    debug: bool = True
    api_prefix: str = "/api/v1"

    # ── Security ─────────────────────────────────────────────────────────────
    secret_key: str = Field(min_length=32)
    cors_origins: list[str] = ["http://localhost:8001", "http://localhost:3010", "http://localhost:3001"]  # comma-separated or list  

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str  # postgresql+asyncpg://...
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_echo: bool = False

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    redis_ttl_seconds: int = 300  # default cache TTL

    # ── Logto (OIDC) ─────────────────────────────────────────────────────────
    logto_endpoint: AnyHttpUrl = "http://localhost:3001/"  # type: ignore[assignment]
    logto_app_id: str = ""
    logto_app_secret: str = ""
    logto_api_resource: str = "https://crib.app/api"  # the API resource identifier in Logto
    logto_admin_endpoint: AnyHttpUrl = "http://localhost:3002/"  # type: ignore[assignment]
    logto_m2m_app_id: str = ""
    logto_m2m_app_secret: str = ""

    # ── Settings encryption ───────────────────────────────────────────────────
    # Required in all environments. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # NEVER store this in the database — it is the key that decrypts DB secrets.
    settings_encryption_key: str = Field(default="", alias="SETTINGS_ENCRYPTION_KEY")

    # ── MinIO (legacy fallback — superseded by system_settings table) ─────────
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "crib-documents"
    minio_secure: bool = False

    # ── Celery ────────────────────────────────────────────────────────────────
    celery_broker_url: str = ""  # defaults to redis_url if empty
    celery_result_backend: str = ""

    # ── Notifications ─────────────────────────────────────────────────────────
    # SMS: "twilio" | "africastalking"
    sms_provider: str = "twilio"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    africastalking_api_key: str = ""
    africastalking_username: str = ""
    africastalking_sender_id: str = ""

    # Email: "sendgrid" | "smtp"
    email_provider: str = "sendgrid"
    sendgrid_api_key: str = ""
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    email_from: str = "noreply@crib.app"

    # WhatsApp (Meta Cloud API)
    whatsapp_api_key: str = ""
    whatsapp_phone_id: str = ""

    @field_validator("logto_app_id", mode="after")
    @classmethod
    def warn_logto_not_configured(cls, v: str, info) -> str:
        # Validated after all fields are set — warn in dev, raise in prod
        env = info.data.get("environment", "development")
        if not v and env != Environment.development:
            raise ValueError(
                "LOGTO_APP_ID is required in non-development environments"
            )
        return v

    @property
    def is_dev(self) -> bool:
        return self.environment == Environment.development

    @property
    def effective_celery_broker(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def effective_celery_backend(self) -> str:
        return self.celery_result_backend or self.redis_url

    @property
    def logto_jwks_uri(self) -> str:
        return f"{self.logto_endpoint}oidc/jwks"

    @property
    def logto_issuer(self) -> str:
        return f"{self.logto_endpoint}oidc"

    @property
    def logto_management_api_base(self) -> str:
        return f"{self.logto_admin_endpoint}api"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
