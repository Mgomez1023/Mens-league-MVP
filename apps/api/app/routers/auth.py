from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..deps import get_db
from ..models import User
from ..security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = "dev-change-me"
JWT_ALG = "HS256"
JWT_EXPIRES_MIN = 720

@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password) or not user.is_admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(
        user_id=user.id,
        secret=JWT_SECRET,
        alg=JWT_ALG,
        expires_min=JWT_EXPIRES_MIN,
        is_admin=user.is_admin,
    )
    return {"access_token": token}
