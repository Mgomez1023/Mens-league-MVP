from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..deps import get_db
from ..deps import get_user_role
from ..models import Team, User
from ..security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    role = get_user_role(user)
    if role == "manager" and user.team_id is None:
        raise HTTPException(status_code=403, detail="Manager account is not assigned to a team")

    team = db.get(Team, user.team_id) if user.team_id is not None else None
    token = create_access_token(
        user_id=user.id,
        secret=settings.jwt_secret,
        alg=settings.jwt_alg,
        expires_min=settings.jwt_expires_min,
        is_admin=user.is_admin,
        role=role,
        team_id=user.team_id,
        team_name=team.name if team else None,
        email=user.email,
    )
    return {"access_token": token}
