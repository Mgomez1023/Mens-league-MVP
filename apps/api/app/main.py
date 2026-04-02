from fastapi import FastAPI
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, engine, SessionLocal
from datetime import date

from .models import PlayerAppearance, Season, Team, User
from .security import hash_password
from sqlalchemy import inspect, text
import re

from .routers.auth import router as auth_router
from .routers.admin import router as admin_router
from .routers.public import router as public_router
from .storage import UPLOADS_DIR

app = FastAPI(title="Men's League MVP API")


def run_startup_step(step):
    try:
        step()
    except Exception as exc:
        print(f"[startup warning] {step.__name__} failed: {exc}")


def ensure_metadata():
    Base.metadata.create_all(bind=engine)

def ensure_player_columns():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("players")}
    statements: list[str] = []

    if "number" not in columns:
        statements.append("ALTER TABLE players ADD COLUMN number INTEGER")
    if "position" not in columns:
        statements.append("ALTER TABLE players ADD COLUMN position VARCHAR")
    if "bats" not in columns:
        statements.append("ALTER TABLE players ADD COLUMN bats VARCHAR")
    if "throws" not in columns:
        statements.append("ALTER TABLE players ADD COLUMN throws VARCHAR")
    if "photo_image" not in columns:
        if engine.dialect.name == "postgresql":
            statements.append("ALTER TABLE players ADD COLUMN photo_image BYTEA")
        else:
            statements.append("ALTER TABLE players ADD COLUMN photo_image BLOB")
    if "photo_updated_at" not in columns:
        if engine.dialect.name == "postgresql":
            statements.append("ALTER TABLE players ADD COLUMN photo_updated_at TIMESTAMP")
        else:
            statements.append("ALTER TABLE players ADD COLUMN photo_updated_at DATETIME")

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))

run_startup_step(ensure_metadata)
run_startup_step(ensure_player_columns)


def ensure_photo_columns():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("photos")}
    statements: list[str] = []

    if "photo_image" not in columns:
        if engine.dialect.name == "postgresql":
            statements.append("ALTER TABLE photos ADD COLUMN photo_image BYTEA")
        else:
            statements.append("ALTER TABLE photos ADD COLUMN photo_image BLOB")
    if "photo_updated_at" not in columns:
        if engine.dialect.name == "postgresql":
            statements.append("ALTER TABLE photos ADD COLUMN photo_updated_at TIMESTAMP")
        else:
            statements.append("ALTER TABLE photos ADD COLUMN photo_updated_at DATETIME")

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


run_startup_step(ensure_photo_columns)

def ensure_game_columns():
    inspector = inspect(engine)
    if "games" not in inspector.get_table_names():
        return

    if engine.dialect.name == "sqlite":
        with engine.begin() as conn:
            result = conn.execute(text("PRAGMA table_info(games)"))
            columns = {row[1]: row for row in result}
            needs_rebuild = (
                "home_team_name" not in columns
                or "away_team_name" not in columns
                or columns.get("home_team_id", (None, None, None, 1))[3] == 1
                or columns.get("away_team_id", (None, None, None, 1))[3] == 1
            )
            if not needs_rebuild:
                if "time" not in columns:
                    conn.execute(text("ALTER TABLE games ADD COLUMN time VARCHAR"))
                return

            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(text("ALTER TABLE games RENAME TO games_old"))
            conn.execute(
                text(
                    """
                    CREATE TABLE games (
                        id INTEGER NOT NULL PRIMARY KEY,
                        season_id INTEGER NOT NULL REFERENCES seasons(id),
                        date DATE NOT NULL,
                        time VARCHAR,
                        field VARCHAR,
                        home_team_id INTEGER REFERENCES teams(id),
                        away_team_id INTEGER REFERENCES teams(id),
                        home_team_name VARCHAR,
                        away_team_name VARCHAR,
                        home_score INTEGER,
                        away_score INTEGER,
                        status VARCHAR NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO games (
                        id,
                        season_id,
                        date,
                        time,
                        field,
                        home_team_id,
                        away_team_id,
                        home_team_name,
                        away_team_name,
                        home_score,
                        away_score,
                        status
                    )
                    SELECT
                        id,
                        season_id,
                        date,
                        time,
                        field,
                        home_team_id,
                        away_team_id,
                        NULL,
                        NULL,
                        home_score,
                        away_score,
                        status
                    FROM games_old
                    """
                )
            )
            conn.execute(text("DROP TABLE games_old"))
            conn.execute(text("PRAGMA foreign_keys=ON"))
        return

    columns = {column["name"] for column in inspector.get_columns("games")}
    statements: list[str] = []
    if "time" not in columns:
        statements.append("ALTER TABLE games ADD COLUMN time VARCHAR")
    if "home_team_name" not in columns:
        statements.append("ALTER TABLE games ADD COLUMN home_team_name VARCHAR")
    if "away_team_name" not in columns:
        statements.append("ALTER TABLE games ADD COLUMN away_team_name VARCHAR")

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
        conn.execute(text("ALTER TABLE games ALTER COLUMN home_team_id DROP NOT NULL"))
        conn.execute(text("ALTER TABLE games ALTER COLUMN away_team_id DROP NOT NULL"))

run_startup_step(ensure_game_columns)

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

run_startup_step(ensure_post_columns)

def ensure_team_columns():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("teams")}
    statements: list[str] = []

    if "logo_image" not in columns:
        if engine.dialect.name == "postgresql":
            statements.append("ALTER TABLE teams ADD COLUMN logo_image BYTEA")
        else:
            statements.append("ALTER TABLE teams ADD COLUMN logo_image BLOB")

    if "logo_updated_at" not in columns:
        if engine.dialect.name == "postgresql":
            statements.append("ALTER TABLE teams ADD COLUMN logo_updated_at TIMESTAMP")
        else:
            statements.append("ALTER TABLE teams ADD COLUMN logo_updated_at DATETIME")

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))

run_startup_step(ensure_team_columns)


def ensure_user_columns():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("users")}
    statements: list[str] = []
    added_role = False
    added_team_id = False

    if "role" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN role VARCHAR")
        added_role = True
    if "team_id" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN team_id INTEGER")
        added_team_id = True

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))

        if "role" in columns or added_role:
            conn.execute(
                text(
                    "UPDATE users "
                    "SET role = CASE WHEN COALESCE(is_admin, FALSE) THEN 'admin' ELSE 'manager' END "
                    "WHERE role IS NULL OR role = ''"
                )
            )
        if "team_id" in columns or added_team_id:
            conn.execute(
                text(
                    "UPDATE users "
                    "SET team_id = NULL "
                    "WHERE team_id IS NOT NULL AND COALESCE(is_admin, FALSE)"
                )
            )

        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_manager_team "
                "ON users(team_id) WHERE role = 'manager' AND team_id IS NOT NULL"
            )
        )


run_startup_step(ensure_user_columns)


def ensure_player_appearances_table():
    inspector = inspect(engine)
    if "player_appearances" in inspector.get_table_names():
        return
    PlayerAppearance.__table__.create(bind=engine, checkfirst=True)


run_startup_step(ensure_player_appearances_table)

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

def slugify_team_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "team"


def build_manager_email(team_name: str) -> str:
    return f"{slugify_team_name(team_name)}.manager@{settings.manager_email_domain}"


def seed_auth_users():
    db: Session = SessionLocal()
    try:
        inspector = inspect(engine)
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "role" not in user_columns or "team_id" not in user_columns:
            print("[startup warning] seed_auth_users skipped: users table is missing role/team_id columns")
            return

        email = settings.admin_email
        password = settings.admin_password

        existing = db.query(User).filter(User.email == email).first()
        if not existing:
            db.add(User(
                email=email,
                hashed_password=hash_password(password),
                is_admin=True,
                role="admin",
                team_id=None,
            ))
            db.commit()
        else:
            updated = False
            if existing.hashed_password == "":
                existing.hashed_password = hash_password(password)
                updated = True
            if not existing.is_admin:
                existing.is_admin = True
                updated = True
            if existing.role != "admin":
                existing.role = "admin"
                updated = True
            if existing.team_id is not None:
                existing.team_id = None
                updated = True
            if updated:
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

        teams = db.query(Team).order_by(Team.id.asc()).all()
        for team in teams:
            manager_email = build_manager_email(team.name)
            manager = (
                db.query(User)
                .filter((User.email == manager_email) | ((User.role == "manager") & (User.team_id == team.id)))
                .order_by(User.id.asc())
                .first()
            )
            if not manager:
                db.add(
                    User(
                        email=manager_email,
                        hashed_password=hash_password(settings.manager_default_password),
                        is_admin=False,
                        role="manager",
                        team_id=team.id,
                    )
                )
                db.commit()
                continue

            updated = False
            if manager.email != manager_email:
                manager.email = manager_email
                updated = True
            if manager.role != "manager":
                manager.role = "manager"
                updated = True
            if manager.is_admin:
                manager.is_admin = False
                updated = True
            if manager.team_id != team.id:
                manager.team_id = team.id
                updated = True
            if updated:
                db.commit()
    finally:
        db.close()

run_startup_step(seed_auth_users)

app.include_router(auth_router)
app.include_router(public_router)
app.include_router(admin_router)

@app.get("/health")
def health():
    return {"ok": True}
