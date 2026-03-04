import os


def _parse_csv_env(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class Settings:
    def __init__(self) -> None:
        database_url = os.getenv("DATABASE_URL", "sqlite:///./app.db")
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        self.database_url = database_url

        self.jwt_secret = os.getenv("JWT_SECRET", "dev-change-me")
        self.jwt_alg = os.getenv("JWT_ALG", "HS256")
        self.jwt_expires_min = _int_env("JWT_EXPIRES_MIN", 720)

        self.cors_allow_origins = _parse_csv_env(
            os.getenv(
                "CORS_ALLOW_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            )
        )

        self.admin_email = os.getenv("ADMIN_EMAIL", "admin@league.local")
        self.admin_password = os.getenv("ADMIN_PASSWORD", "admin123")


settings = Settings()
