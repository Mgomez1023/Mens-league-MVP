from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..deps import get_db
from ..models import User
from ..security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password) or not user.is_admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(
        user_id=user.id,
        secret=settings.jwt_secret,
        alg=settings.jwt_alg,
        expires_min=settings.jwt_expires_min,
        is_admin=user.is_admin,
    )
    return {"access_token": token}
