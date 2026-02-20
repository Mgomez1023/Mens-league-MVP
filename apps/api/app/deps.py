from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import User

bearer = HTTPBearer()

JWT_SECRET = "dev-change-me"
JWT_ALG = "HS256"

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_admin(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    is_admin_claim = payload.get("is_admin") is True or payload.get("role") == "admin"
    if not is_admin_claim:
        raise HTTPException(status_code=403, detail="Admin required")

    user = db.get(User, user_id)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    return user
