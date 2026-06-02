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
    debug: bool = False  # overridden by property below — set via DEBUG env var or derived from environment
    api_prefix: str = "/api/v1"

    # ── Security ─────────────────────────────────────────────────────────────
    secret_key: str = Field(min_length=32)
    # Stored as a plain string so pydantic-settings doesn't try to JSON-decode it.
    # The property below splits on commas so the rest of the app sees a list.
    # In .env.production: CORS_ORIGINS=https://crib.example.com,https://other.com
    cors_origins: str = "http://localhost:8001,http://localhost:3000,http://localhost:3001"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str  # postgresql+asyncpg://...
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_echo: bool = False

    # ── RBAC framework (shared database on same Postgres server as Crib) ─────
    # Format: postgresql+asyncpg://user:pass@host/rbac
    # Same rbac DB used by GeoBox — one source of truth for roles/plans.
    rbac_database_url: str | None = None

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    redis_ttl_seconds: int = 300  # default cache TTL

    # ── Logto (OIDC) ─────────────────────────────────────────────────────────
    logto_endpoint: AnyHttpUrl = "http://logto:3001/"  # type: ignore[assignment]
    logto_app_id: str = ""
    logto_app_secret: str = ""
    logto_api_resource: str = "http://localhost:8001"  # the API resource identifier in Logto
    logto_admin_endpoint: AnyHttpUrl = "http://localhost:3002/"  # type: ignore[assignment]
    logto_admin_api_resource: AnyHttpUrl = "https://default.logto.app/api"  # type: ignore # the Management API resource identifier in Logto
    logto_m2m_app_id: str = ""
    logto_m2m_app_secret: str = ""
    # Optional: override JWKS fetch URL with a Docker-internal address while keeping
    # logto_endpoint (and therefore logto_issuer) as the public browser-accessible URL.
    # Example in docker-compose: LOGTO_JWKS_URI=http://logto:3001/oidc/jwks
    logto_jwks_uri_override: str = ""
    # Name of the Logto *organisation* role to assign to newly-created tenant users.
    # Must match a role you have created under Organizations → Roles in the Logto console.
    logto_tenant_org_role_name: str = "tenant"

    # ── Frontend ──────────────────────────────────────────────────────────────
    # Base URL that tenants use to reach the app (used in welcome emails).
    frontend_url: str = "http://localhost:3000"

    # ── Settings encryption ───────────────────────────────────────────────────
    # Required in all environments. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # NEVER store this in the database — it is the key that decrypts DB secrets.
    settings_encryption_key: str = Field(default="", alias="SETTINGS_ENCRYPTION_KEY")

    # ── Storage ───────────────────────────────────────────────────────────────
    # Base URL for the local-dev storage provider.
    # Leave empty (default) so presign URLs are relative paths (/api/upload/local/...)
    # that the browser resolves against the frontend origin — no CORS issues.
    # In production this is irrelevant (S3/R2/MinIO return real presigned URLs).
    storage_local_base_url: str = ""

    # ── MinIO (legacy fallback — superseded by system_settings table) ─────────
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "crib-documents"
    minio_secure: bool = False

    # ── Celery ────────────────────────────────────────────────────────────────
    celery_broker_url: str = ""  # defaults to redis_url if empty
    celery_result_backend: str = ""

    # ── MTN MoMo ─────────────────────────────────────────────────────────────
    # Obtain from https://momodeveloper.mtn.com — one set of credentials per product.
    mtn_subscription_key: str = ""          # Ocp-Apim-Subscription-Key
    mtn_api_user_id: str = ""               # UUID provisioned via API user endpoint
    mtn_api_key: str = ""                   # Secret retrieved after provisioning
    mtn_base_url: str = "https://sandbox.momodeveloper.mtn.com"
    mtn_environment: str = "sandbox"        # "sandbox" | "mtnuganda" | "mtncameroon" etc.
    mtn_callback_host: str = ""             # Public HTTPS URL, e.g. "https://api.crib.app"
    mtn_token_ttl_seconds: int = 3500       # access token expires in ~3600 s; refresh 100 s early

    # ── Airtel Money ──────────────────────────────────────────────────────────
    airtel_client_id: str = ""
    airtel_client_secret: str = ""
    airtel_base_url: str = "https://openapi.airtel.africa"
    airtel_country: str = "UG"
    airtel_currency: str = "UGX"
    airtel_callback_host: str = ""          # Public HTTPS URL for payment callbacks

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
    def is_debug(self) -> bool:
        """True when explicitly set via DEBUG=true, or automatically in development."""
        return self.debug or self.environment == Environment.development

    @property
    def effective_celery_broker(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def effective_celery_backend(self) -> str:
        return self.celery_result_backend or self.redis_url

    @property
    def logto_jwks_uri(self) -> str:
        # Use the override (e.g. Docker-internal URL) if set; otherwise derive from endpoint.
        return self.logto_jwks_uri_override or f"{self.logto_endpoint}oidc/jwks"

    @property
    def logto_issuer(self) -> str:
        return f"{self.logto_endpoint}oidc"

    @property
    def logto_management_api_base(self) -> str:
        # Management API is on the admin port (3002), not the public OIDC port.
        # logto_admin_endpoint = http://geobox-logto-prod:3002
        return f"{self.logto_admin_endpoint}api"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
