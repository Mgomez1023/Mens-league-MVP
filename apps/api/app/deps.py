from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .config import settings
from .db import SessionLocal
from .models import Game, Team, User

bearer = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user_role(user: User) -> str:
    if user.role in {"admin", "manager"}:
        return user.role
    return "admin" if user.is_admin else "manager"


def is_admin_user(user: User) -> bool:
    return get_user_role(user) == "admin" and user.is_admin


def is_manager_user(user: User) -> bool:
    return get_user_role(user) == "manager"


def _decode_token_user_id(token: str) -> int:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def _validate_user_assignment(user: User):
    role = get_user_role(user)
    if role == "manager" and user.team_id is None:
        raise HTTPException(status_code=403, detail="Manager account is not assigned to a team")
    if role == "admin" and not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    return user


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    user_id = _decode_token_user_id(creds.credentials)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return _validate_user_assignment(user)


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin required")
    return user


def require_team_access(user: User, team_id: int, *, allow_admin: bool = True):
    if allow_admin and is_admin_user(user):
        return
    if not is_manager_user(user) or user.team_id != team_id:
        raise HTTPException(status_code=403, detail="You do not have access to this team")


def get_game_for_user(game_id: int, user: User, db: Session) -> Game:
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if is_admin_user(user):
        return game
    if user.team_id not in {game.home_team_id, game.away_team_id}:
        raise HTTPException(status_code=403, detail="You do not have access to this game lineup")
    return game


def get_team_or_404(team_id: int, db: Session) -> Team:
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team
