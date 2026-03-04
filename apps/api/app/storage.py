import os
from pathlib import Path


def _resolve_uploads_dir() -> Path:
    explicit = os.getenv("UPLOADS_DIR")
    if explicit:
        return Path(explicit)
    if os.getenv("VERCEL") == "1":
        return Path("/tmp/uploads")
    return Path(__file__).resolve().parent / "uploads"


UPLOADS_DIR = _resolve_uploads_dir()
TEAM_LOGO_DIR = UPLOADS_DIR / "teams"
POST_IMAGE_DIR = UPLOADS_DIR / "posts"
TEAM_LOGO_DIR.mkdir(parents=True, exist_ok=True)
POST_IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def team_logo_path(team_id: int) -> Path:
    return TEAM_LOGO_DIR / f"{team_id}.jpg"


def team_logo_url(team_id: int) -> str | None:
    path = team_logo_path(team_id)
    if path.exists():
        return f"/uploads/teams/{team_id}.jpg"
    return None


def post_image_path(post_id: int) -> Path:
    return POST_IMAGE_DIR / f"{post_id}.jpg"


def post_image_url(post_id: int) -> str | None:
    path = post_image_path(post_id)
    if path.exists():
        return f"/uploads/posts/{post_id}.jpg"
    return None
