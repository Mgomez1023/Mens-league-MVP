from fastapi import FastAPI
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, engine, SessionLocal
from datetime import date

from .models import Season, Team, User
from .security import hash_password
from sqlalchemy import text

from .routers.auth import router as auth_router
from .routers.admin import router as admin_router
from .routers.public import router as public_router
from .storage import UPLOADS_DIR

app = FastAPI(title="Men's League MVP API")

Base.metadata.create_all(bind=engine)

def ensure_player_columns():
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(players)"))
        columns = {row[1] for row in result}
        if "number" not in columns:
            conn.execute(text("ALTER TABLE players ADD COLUMN number INTEGER"))
        if "position" not in columns:
            conn.execute(text("ALTER TABLE players ADD COLUMN position VARCHAR"))

ensure_player_columns()

def ensure_game_columns():
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(games)"))
        columns = {row[1] for row in result}
        if "time" not in columns:
            conn.execute(text("ALTER TABLE games ADD COLUMN time VARCHAR"))

ensure_game_columns()

def ensure_post_columns():
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(posts)"))
        columns = {row[1] for row in result}
        if not columns:
            return
        if "author_name" not in columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN author_name VARCHAR"))
            conn.execute(text("UPDATE posts SET author_name = 'system' WHERE author_name IS NULL"))
        if "created_at" not in columns:
            conn.execute(text("ALTER TABLE posts ADD COLUMN created_at DATETIME"))
            conn.execute(text("UPDATE posts SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))

ensure_post_columns()

allow_all_origins = "*" in settings.cors_allow_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else settings.cors_allow_origins,
    allow_origin_regex=None if allow_all_origins else settings.cors_allow_origin_regex,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

def seed_admin():
    db: Session = SessionLocal()
    try:
        email = settings.admin_email
        password = settings.admin_password

        existing = db.query(User).filter(User.email == email).first()
        if not existing:
            db.add(User(
                email=email,
                hashed_password=hash_password(password),
                is_admin=True
            ))
            db.commit()
            
        if db.query(Season).count() == 0:
            current_year = date.today().year
            db.add(Season(year=current_year, name="Regular Season"))
            db.commit()

        if db.query(Team).count() == 0:
            db.add_all([
                Team(name="Cubs", home_field="Field 1"),
                Team(name="Sox", home_field="Field 2"),
            ])
            db.commit()
    finally:
        db.close()

seed_admin()

app.include_router(auth_router)
app.include_router(public_router)
app.include_router(admin_router)

@app.get("/health")
def health():
    return {"ok": True}
