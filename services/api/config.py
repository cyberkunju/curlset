"""
Validated application configuration with local-first defaults and strict limits.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    ENVIRONMENT: str = "development"
    API_HOST: str = "127.0.0.1"
    API_PORT: int = 8000
    WEB_PORT: int = 5173
    SECRET_KEY: str = "dev-secret-key-replace-in-production"

    DATABASE_URL: str = "sqlite:///./data/dataset_platform.db"
    STORAGE_BACKEND: str = "local"
    LOCAL_STORAGE_DIR: str = "./data/storage"

    WORKER_MODE: str = "inline"
    PRIVACY_MODE: str = "local_only"

    #: Development convenience: register the deterministic ``sim-*`` providers at startup so the
    #: Ensemble Lab / Gated Generation UI can be exercised end to end with zero API spend.
    #: Off by default; must never be enabled in a hosted deployment.
    ALLOW_SIMULATED_PROVIDERS: bool = False

    #: Register image-generation providers from OPENAI_API_KEY / META_API_KEY env vars.
    #: Off by default: these calls cost money per image.
    ENABLE_LIVE_IMAGE_PROVIDERS: bool = False

    MAX_UPLOAD_SIZE_BYTES: int = 104857600       # 100 MB
    MAX_ARCHIVE_ENTRY_COUNT: int = 1000          # 1000 items
    MAX_DECOMPRESSED_SIZE_BYTES: int = 524288000 # 500 MB
    MAX_PARSING_TIMEOUT_SECONDS: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = AppSettings()
