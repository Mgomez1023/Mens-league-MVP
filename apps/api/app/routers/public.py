import csv
import datetime
import re
from io import TextIOWrapper

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ..models import Team, Game, Player, Season
from ..standings import compute_team_records
from ..storage import team_logo_url

router = APIRouter(tags=["public"])


def serialize_team(team: Team, record: dict[str, int]):
    return {
        "id": team.id,
        "name": team.name,
        "home_field": team.home_field,
        "wins": record.get("wins", 0),
        "losses": record.get("losses", 0),
        "logo_url": team_logo_url(team.id),
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


def serialize_player(player: Player):
    return {
        "id": player.id,
        "team_id": player.team_id,
        "first_name": player.first_name,
        "last_name": player.last_name,
        "number": player.number,
        "position": player.position,
        "bats": player.bats,
        "throws": player.throws,
    }


@router.get("/teams")
def list_teams(db: Session = Depends(get_db)):
    teams = db.query(Team).order_by(Team.name.asc()).all()
    records = compute_team_records(db, [team.id for team in teams])
    return [serialize_team(team, records.get(team.id, {})) for team in teams]


@router.get("/games")
def list_games(db: Session = Depends(get_db)):
    games = db.query(Game).order_by(Game.date.asc(), Game.time.asc()).all()
    return [serialize_game(game) for game in games]


@router.get("/teams/{team_id}/players")
def list_team_players(team_id: int, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    players = (
        db.query(Player)
        .filter(Player.team_id == team_id)
        .order_by(Player.last_name.asc(), Player.first_name.asc())
        .all()
    )
    return [serialize_player(player) for player in players]


@router.get("/teams/{team_id}/roster")
def get_roster(team_id: int, db: Session = Depends(get_db)):
    return list_team_players(team_id, db)


@router.post("/teams/{team_id}/roster/import-csv")
def import_roster_csv(
    team_id: int,
    file: UploadFile = File(...),
    _: object = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
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
