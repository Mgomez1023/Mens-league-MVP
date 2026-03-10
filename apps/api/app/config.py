import os
import shutil
from pathlib import Path


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


def _prepare_vercel_sqlite(database_url: str) -> str:
    target_path = Path("/tmp/app.db")
    if target_path.exists():
        return f"sqlite:////tmp/app.db"

    source_path: Path | None = None
    if database_url.startswith("sqlite:///./"):
        relative = database_url.removeprefix("sqlite:///./")
        source_path = Path.cwd() / relative
    elif database_url.startswith("sqlite:////"):
        source_path = Path(database_url.removeprefix("sqlite:////"))
    elif database_url.startswith("sqlite:///"):
        relative = database_url.removeprefix("sqlite:///")
        source_path = Path.cwd() / relative

    if source_path and source_path.exists():
        try:
            shutil.copy2(source_path, target_path)
        except Exception:
            # If copy fails, SQLAlchemy will create an empty DB in /tmp.
            pass

    return f"sqlite:////tmp/app.db"


class Settings:
    def __init__(self) -> None:
        database_url = os.getenv("DATABASE_URL", "sqlite:///./app.db")
        if os.getenv("VERCEL") == "1" and database_url.startswith("sqlite"):
            database_url = _prepare_vercel_sqlite(database_url)
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
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
        # Keep local dev explicit, and allow Vercel web deployments by default.
        self.cors_allow_origin_regex = os.getenv(
            "CORS_ALLOW_ORIGIN_REGEX",
            r"https://.*\.vercel\.app",
        )
        if self.cors_allow_origin_regex == "":
            self.cors_allow_origin_regex = None

        self.admin_email = os.getenv("ADMIN_EMAIL", "admin@league.local")
        self.admin_password = os.getenv("ADMIN_PASSWORD", "admin123")


settings = Settings()
