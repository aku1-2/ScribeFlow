from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Default to production-safe behavior. Set APP_ENV=development explicitly for local dev auth.
    app_env: str = "production"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/scribeflow"
    frontend_origin: str = "http://localhost:5173"

    # Transcription configuration (secrets stay strictly on backend)
    transcription_provider: str = "auto"  # "auto", "openai", "groq", "local", "none"
    openai_api_key: str | None = None
    groq_api_key: str | None = None

    # YouTube / Google OAuth configuration (optional, server-only)
    youtube_api_key: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None

    # Supabase Auth configuration (secrets stay strictly on backend)
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_audience: str = "authenticated"
    auth_dev_secret: str | None = None

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
