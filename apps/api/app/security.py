from datetime import datetime, timedelta
import bcrypt
from jose import jwt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_access_token(
    *,
    user_id: int,
    secret: str,
    alg: str,
    expires_min: int,
    is_admin: bool = False,
) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(minutes=expires_min),
        "is_admin": is_admin,
        "role": "admin" if is_admin else "user",
    }
    return jwt.encode(payload, secret, algorithm=alg)
