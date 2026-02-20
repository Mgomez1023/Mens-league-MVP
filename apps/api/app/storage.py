from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
TEAM_LOGO_DIR = UPLOADS_DIR / "teams"
TEAM_LOGO_DIR.mkdir(parents=True, exist_ok=True)


def team_logo_path(team_id: int) -> Path:
    return TEAM_LOGO_DIR / f"{team_id}.jpg"


def team_logo_url(team_id: int) -> str | None:
    path = team_logo_path(team_id)
    if path.exists():
        return f"/uploads/teams/{team_id}.jpg"
    return None
