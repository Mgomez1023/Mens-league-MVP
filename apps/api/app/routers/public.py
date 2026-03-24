import csv
import datetime
import re
from io import BytesIO, TextIOWrapper

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from PIL import Image
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from ..deps import get_current_admin, get_current_user, get_db, require_team_access
from ..config import settings
from ..models import PlayerAppearance, Team, Game, Player, Post, Season, User
from ..schemas import PlayerAppearanceSummaryOut, PostOut
from ..standings import compute_team_records
from ..storage import (
    player_image_path,
    player_image_url,
    post_image_path,
    post_image_url,
    team_logo_path,
    team_logo_url,
)

router = APIRouter(tags=["public"])


def serialize_team(team: Team, record: dict[str, int]):
    return {
        "id": team.id,
        "name": team.name,
        "home_field": team.home_field,
        "wins": record.get("wins", 0),
        "losses": record.get("losses", 0),
        "logo_url": team_logo_url(
            team.id,
            has_db_logo=team.logo_image is not None,
            logo_updated_at=team.logo_updated_at,
        ),
    }


def serialize_game(game: Game):
    return {
        "id": game.id,
        "date": game.date,
        "time": game.time,
        "field": game.field,
        "home_team_id": game.home_team_id,
        "away_team_id": game.away_team_id,
        "home_score": game.home_score,
        "away_score": game.away_score,
        "status": game.status,
    }


def serialize_player(player: Player, games_played: int = 0):
    return {
        "id": player.id,
        "team_id": player.team_id,
        "first_name": player.first_name,
        "last_name": player.last_name,
        "number": player.number,
        "position": player.position,
        "bats": player.bats,
        "throws": player.throws,
        "image_url": player_image_url(
            player.id,
            has_db_image=player.photo_image is not None,
            image_updated_at=player.photo_updated_at,
        ),
        "games_played": games_played,
    }


def serialize_post(post: Post):
    return {
        "id": post.id,
        "content": post.content,
        "author_name": post.author_name,
        "created_at": post.created_at,
        "image_url": post_image_url(post.id),
    }


def build_games_played_map(db: Session, team_id: int) -> dict[int, int]:
    rows = (
        db.query(
            PlayerAppearance.player_id,
            func.count(PlayerAppearance.id),
        )
        .filter(PlayerAppearance.team_id == team_id)
        .group_by(PlayerAppearance.player_id)
        .all()
    )
    return {player_id: games_played for player_id, games_played in rows}


def build_player_appearance_summary(player_id: int, db: Session):
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    team = db.get(Team, player.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    home_team = aliased(Team)
    away_team = aliased(Team)
    rows = (
        db.query(
            PlayerAppearance,
            Game,
            home_team.name,
            away_team.name,
        )
        .join(Game, PlayerAppearance.game_id == Game.id)
        .join(home_team, Game.home_team_id == home_team.id)
        .join(away_team, Game.away_team_id == away_team.id)
        .filter(PlayerAppearance.player_id == player_id)
        .order_by(Game.date.desc(), Game.time.desc(), Game.id.desc())
        .all()
    )

    history = []
    for _, game, home_team_name, away_team_name in rows:
        is_home = player.team_id == game.home_team_id
        opponent_team_id = game.away_team_id if is_home else game.home_team_id
        opponent_team_name = away_team_name if is_home else home_team_name
        history.append(
            {
                "game_id": game.id,
                "game_date": game.date,
                "matchup": f"{away_team_name} vs {home_team_name}",
                "opponent_team_id": opponent_team_id,
                "opponent_team_name": opponent_team_name,
                "field": game.field,
                "status": game.status,
            }
        )

    total_games_played = len(history)
    minimum_required_games = settings.playoff_minimum_games
    return {
        "player_id": player.id,
        "player_name": f"{player.first_name} {player.last_name}",
        "team_id": team.id,
        "team_name": team.name,
        "total_games_played": total_games_played,
        "minimum_required_games": minimum_required_games,
        "eligible": total_games_played >= minimum_required_games,
        "history": history,
    }


@router.get("/teams")
def list_teams(db: Session = Depends(get_db)):
    teams = db.query(Team).order_by(Team.name.asc()).all()
    records = compute_team_records(db, [team.id for team in teams])
    return [serialize_team(team, records.get(team.id, {})) for team in teams]


@router.get("/teams/{team_id}/logo")
def get_team_logo(team_id: int, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if team.logo_image:
        return Response(
            content=team.logo_image,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    path = team_logo_path(team_id)
    if path.exists():
        return FileResponse(path, media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Logo not found")


@router.get("/games")
def list_games(db: Session = Depends(get_db)):
    games = db.query(Game).order_by(Game.date.asc(), Game.time.asc()).all()
    return [serialize_game(game) for game in games]


@router.get("/posts", response_model=list[PostOut])
def list_posts(db: Session = Depends(get_db)):
    posts = db.query(Post).order_by(Post.created_at.desc(), Post.id.desc()).all()
    return [serialize_post(post) for post in posts]


@router.post("/posts", response_model=PostOut)
def create_post(
    content: str = Form(...),
    image: UploadFile | None = File(default=None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    trimmed_content = content.strip()
    if not trimmed_content:
        raise HTTPException(status_code=400, detail="Content is required")
    if len(trimmed_content) > 5000:
        raise HTTPException(status_code=400, detail="Content must be 5000 characters or fewer")
    if image and (not image.content_type or not image.content_type.startswith("image/")):
        raise HTTPException(status_code=400, detail="Invalid image type")

    post = Post(
        content=trimmed_content,
        author_name=admin.email,
    )
    db.add(post)
    db.flush()

    if image:
        output = BytesIO()
        try:
            picture = Image.open(image.file)
            picture = picture.convert("RGB")
            picture.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            picture.save(output, format="JPEG", quality=88)
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail="Unable to process image") from exc

        output.seek(0)
        path = post_image_path(post.id)
        tmp_path = path.with_suffix(".tmp")
        try:
            with open(tmp_path, "wb") as handle:
                handle.write(output.read())
            tmp_path.replace(path)
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail="Unable to save image") from exc
        finally:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass

    db.commit()
    db.refresh(post)
    return serialize_post(post)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(
    post_id: int,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    image_path = post_image_path(post_id)
    db.delete(post)
    db.commit()

    if image_path.exists():
        try:
            image_path.unlink()
        except Exception:
            pass

    return Response(status_code=204)


@router.get("/teams/{team_id}/players")
def list_team_players(team_id: int, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    games_played_map = build_games_played_map(db, team_id)
    players = (
        db.query(Player)
        .filter(Player.team_id == team_id)
        .order_by(Player.last_name.asc(), Player.first_name.asc())
        .all()
    )
    return [serialize_player(player, games_played_map.get(player.id, 0)) for player in players]


@router.get("/players/{player_id}/image")
def get_player_image(player_id: int, db: Session = Depends(get_db)):
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    if player.photo_image:
        return Response(
            content=player.photo_image,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    path = player_image_path(player_id)
    if path.exists():
        return FileResponse(path, media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Image not found")


@router.get("/teams/{team_id}/roster")
def get_roster(team_id: int, db: Session = Depends(get_db)):
    return list_team_players(team_id, db)


@router.get("/players/{player_id}/appearance-summary", response_model=PlayerAppearanceSummaryOut)
def get_player_appearance_summary(player_id: int, db: Session = Depends(get_db)):
    return build_player_appearance_summary(player_id, db)


@router.post("/teams/{team_id}/roster/import-csv")
def import_roster_csv(
    team_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_team_access(user, team_id)
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSV file required")

    reader = csv.DictReader(
        TextIOWrapper(file.file, encoding="utf-8-sig", newline="")
    )

    def normalize_key(value: str) -> str:
        return value.strip().lower().replace(" ", "_")

    created = 0
    updated = 0
    skipped = 0
    errors: list[dict[str, object]] = []

    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV header missing")

    header_map = {normalize_key(name): name for name in reader.fieldnames if name}

    for row_index, raw in enumerate(reader, start=2):
        if not raw or all((value or "").strip() == "" for value in raw.values()):
            continue

        def get_value(key: str) -> str | None:
            original = header_map.get(key)
            if not original:
                return None
            value = raw.get(original)
            if value is None:
                return None
            value = str(value).strip()
            return value if value else None

        first_name = get_value("first_name")
        last_name = get_value("last_name")

        if not first_name or not last_name:
            skipped += 1
            errors.append({"row": row_index, "message": "first_name and last_name required"})
            continue

        number_value = get_value("number")
        number: int | None = None
        if number_value:
            try:
                number = int(number_value)
            except ValueError:
                skipped += 1
                errors.append({"row": row_index, "message": "number must be an integer"})
                continue

        position = get_value("position")
        bats = get_value("bats")
        throws = get_value("throws")

        query = db.query(Player).filter(
            Player.team_id == team_id,
            Player.first_name == first_name,
            Player.last_name == last_name,
        )
        if number is not None:
            query = query.filter(Player.number == number)

        player = query.first()
        if player:
            changed = False
            if number is not None and player.number != number:
                player.number = number
                changed = True
            if position is not None:
                player.position = position
                changed = True
            if bats is not None:
                player.bats = bats
                changed = True
            if throws is not None:
                player.throws = throws
                changed = True
            if changed:
                updated += 1
        else:
            player = Player(
                team_id=team_id,
                first_name=first_name,
                last_name=last_name,
                number=number,
                position=position,
                bats=bats,
                throws=throws,
            )
            db.add(player)
            created += 1

    db.commit()

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }


@router.post("/games/import-csv")
def import_games_csv(
    file: UploadFile = File(...),
    _: object = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSV file required")

    reader = csv.DictReader(TextIOWrapper(file.file, encoding="utf-8-sig", newline=""))

    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV header missing")

    def normalize_key(value: str) -> str:
        return value.strip().lower().replace(" ", "_")

    def normalize_team(value: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9]", "", value)
        return cleaned.lower()

    header_map = {normalize_key(name): name for name in reader.fieldnames if name}

    teams = db.query(Team).all()
    team_map = {normalize_team(team.name): team for team in teams}

    season = db.query(Season).order_by(Season.year.desc()).first()
    if not season:
        raise HTTPException(status_code=400, detail="No season configured")

    created = 0
    updated = 0
    skipped = 0
    errors: list[dict[str, object]] = []

    def get_value(row: dict[str, object], key: str) -> str | None:
        original = header_map.get(key)
        if not original:
            return None
        value = row.get(original)
        if value is None:
            return None
        value = str(value).strip()
        return value if value else None

    def get_or_create_team(name: str) -> Team:
        normalized = normalize_team(name)
        existing = team_map.get(normalized)
        if existing:
            return existing
        team = Team(name=name.strip())
        db.add(team)
        db.flush()
        team_map[normalized] = team
        return team

    allowed_statuses = {"SCHEDULED", "FINAL", "POSTPONED", "CANCELLED"}

    for row_index, raw in enumerate(reader, start=2):
        if not raw or all((value or "").strip() == "" for value in raw.values()):
            continue

        date_value = get_value(raw, "date")
        time_value = get_value(raw, "time")
        home_name = get_value(raw, "home_team")
        away_name = get_value(raw, "away_team")
        field_value = get_value(raw, "field")

        if not date_value or not home_name or not away_name:
            skipped += 1
            errors.append(
                {
                    "row": row_index,
                    "message": "date, home_team, and away_team are required",
                }
            )
            continue

        try:
            game_date = datetime.date.fromisoformat(date_value)
        except ValueError:
            skipped += 1
            errors.append(
                {"row": row_index, "message": "date must be YYYY-MM-DD"}
            )
            continue

        home_team = get_or_create_team(home_name)
        away_team = get_or_create_team(away_name)

        if home_team.id == away_team.id:
            skipped += 1
            errors.append({"row": row_index, "message": "home_team and away_team must differ"})
            continue

        home_score_value = get_value(raw, "home_score")
        away_score_value = get_value(raw, "away_score")
        home_score: int | None = None
        away_score: int | None = None

        if home_score_value:
            try:
                home_score = int(home_score_value)
            except ValueError:
                skipped += 1
                errors.append({"row": row_index, "message": "home_score must be an integer"})
                continue

        if away_score_value:
            try:
                away_score = int(away_score_value)
            except ValueError:
                skipped += 1
                errors.append({"row": row_index, "message": "away_score must be an integer"})
                continue

        status_value = get_value(raw, "status")
        status: str | None = status_value.upper() if status_value else None
        if status and status not in allowed_statuses:
            skipped += 1
            errors.append(
                {
                    "row": row_index,
                    "message": "status must be SCHEDULED, FINAL, POSTPONED, or CANCELLED",
                }
            )
            continue

        if status == "FINAL" and (home_score is None or away_score is None):
            skipped += 1
            errors.append({"row": row_index, "message": "FINAL requires both scores"})
            continue

        if not status:
            if home_score is not None and away_score is not None:
                status = "FINAL"
            else:
                status = "SCHEDULED"

        existing = (
            db.query(Game)
            .filter(
                Game.date == game_date,
                Game.home_team_id == home_team.id,
                Game.away_team_id == away_team.id,
            )
            .first()
        )

        normalized_time: str | None = None
        has_time = time_value is not None
        if has_time:
            try:
                parsed_time = datetime.time.fromisoformat(time_value)
                normalized_time = parsed_time.strftime("%H:%M")
            except ValueError:
                match = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$", time_value.strip(), re.IGNORECASE)
                if not match:
                    skipped += 1
                    errors.append({"row": row_index, "message": "time must be HH:MM"})
                    continue
                hour = int(match.group(1))
                minute = int(match.group(2) or "0")
                meridiem = match.group(3).lower()
                if hour < 1 or hour > 12 or minute < 0 or minute > 59:
                    skipped += 1
                    errors.append({"row": row_index, "message": "time must be HH:MM"})
                    continue
                if meridiem == "am":
                    hour = 0 if hour == 12 else hour
                else:
                    hour = 12 if hour == 12 else hour + 12
                normalized_time = f"{hour:02d}:{minute:02d}"

        if existing:
            existing.field = field_value
            if has_time:
                existing.time = normalized_time
            existing.home_score = home_score
            existing.away_score = away_score
            existing.status = status
            updated += 1
        else:
            game = Game(
                season_id=season.id,
                date=game_date,
                time=normalized_time,
                field=field_value,
                home_team_id=home_team.id,
                away_team_id=away_team.id,
                home_score=home_score,
                away_score=away_score,
                status=status,
            )
            db.add(game)
            created += 1

    db.commit()

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }
