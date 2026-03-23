import datetime
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from PIL import Image, ImageOps
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from ..config import settings
from ..deps import get_db, get_current_admin
from ..models import Game, Player, PlayerAppearance, Season, Team, User
from ..schemas import EligibilityReportItem, GameLineupOut, GameLineupUpdate
from ..standings import compute_team_records
from ..storage import player_image_url, team_logo_url

router = APIRouter(prefix="/admin", tags=["admin"])


def commit_or_raise(
    db: Session,
    *,
    conflict_detail: str = "Request conflicts with existing data",
):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=conflict_detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while saving changes") from exc


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


def serialize_lineup_team(team: Team, players: list[Player], games_played_map: dict[int, int]):
    ordered_players = sorted(
        players,
        key=lambda player: (
            player.number if player.number is not None else 9999,
            player.last_name.lower(),
            player.first_name.lower(),
        ),
    )
    return {
        "team_id": team.id,
        "team_name": team.name,
        "players": [
            serialize_player(player, games_played_map.get(player.id, 0))
            for player in ordered_players
        ],
    }


def build_game_lineup_payload(game_id: int, db: Session):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    home_team = db.get(Team, game.home_team_id)
    away_team = db.get(Team, game.away_team_id)
    if not home_team or not away_team:
        raise HTTPException(status_code=404, detail="Team not found")

    players = (
        db.query(Player)
        .filter(Player.team_id.in_([game.home_team_id, game.away_team_id]))
        .order_by(Player.last_name.asc(), Player.first_name.asc())
        .all()
    )
    home_players = [player for player in players if player.team_id == game.home_team_id]
    away_players = [player for player in players if player.team_id == game.away_team_id]

    selected_player_ids = [
        player_id
        for (player_id,) in (
            db.query(PlayerAppearance.player_id)
            .filter(PlayerAppearance.game_id == game_id)
            .order_by(PlayerAppearance.player_id.asc())
            .all()
        )
    ]

    home_games_played_map = build_games_played_map(db, game.home_team_id)
    away_games_played_map = build_games_played_map(db, game.away_team_id)

    return {
        "game_id": game.id,
        "game_date": game.date,
        "matchup": f"{away_team.name} vs {home_team.name}",
        "minimum_required_games": settings.playoff_minimum_games,
        "selected_player_ids": selected_player_ids,
        "home_team": serialize_lineup_team(home_team, home_players, home_games_played_map),
        "away_team": serialize_lineup_team(away_team, away_players, away_games_played_map),
    }


class GameCreate(BaseModel):
    date: datetime.date
    time: str | None = None
    field: str | None = None
    home_team_id: int = Field(..., gt=0)
    away_team_id: int = Field(..., gt=0)
    status: str = "SCHEDULED"
    home_score: int | None = None
    away_score: int | None = None


class GameUpdate(BaseModel):
    date: datetime.date | None = None
    time: str | None = None
    field: str | None = None
    home_team_id: int | None = Field(default=None, gt=0)
    away_team_id: int | None = Field(default=None, gt=0)
    status: str | None = None
    home_score: int | None = None
    away_score: int | None = None


class TeamCreate(BaseModel):
    name: str = Field(..., min_length=1)
    home_field: str | None = None


class PlayerCreate(BaseModel):
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    number: int | None = None
    position: str | None = None
    bats: str | None = None
    throws: str | None = None


class PlayerUpdate(BaseModel):
    team_id: int | None = Field(default=None, gt=0)
    first_name: str | None = None
    last_name: str | None = None
    number: int | None = None
    position: str | None = None
    bats: str | None = None
    throws: str | None = None

@router.get("/teams")
def list_teams(_: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    teams = db.query(Team).order_by(Team.name.asc()).all()
    records = compute_team_records(db, [team.id for team in teams])
    return [serialize_team(team, records.get(team.id, {})) for team in teams]


@router.post("/teams")
def create_team(
    payload: TeamCreate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(Team).filter(Team.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Team name already exists")

    team = Team(name=payload.name, home_field=payload.home_field)
    db.add(team)
    commit_or_raise(db, conflict_detail="Team name already exists")
    db.refresh(team)
    return serialize_team(team, {"wins": 0, "losses": 0})


@router.delete("/teams/{team_id}")
def delete_team(
    team_id: int,
    force: bool = Query(default=False),
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if not force:
        has_players = db.query(Player).filter(Player.team_id == team_id).count() > 0
        if has_players:
            raise HTTPException(status_code=400, detail="Remove players before deleting team")

        has_games = (
            db.query(Game)
            .filter((Game.home_team_id == team_id) | (Game.away_team_id == team_id))
            .count()
            > 0
        )
        if has_games:
            raise HTTPException(status_code=400, detail="Remove games before deleting team")
    else:
        game_ids = (
            db.query(Game.id)
            .filter((Game.home_team_id == team_id) | (Game.away_team_id == team_id))
            .subquery()
        )
        db.query(PlayerAppearance).filter(
            (PlayerAppearance.team_id == team_id) | (PlayerAppearance.game_id.in_(game_ids))
        ).delete(
            synchronize_session=False
        )
        db.query(Game).filter(
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id)
        ).delete(synchronize_session=False)
        db.query(Player).filter(Player.team_id == team_id).delete(synchronize_session=False)

    db.delete(team)
    commit_or_raise(db)
    return {"ok": True}


@router.post("/teams/{team_id}/logo")
def upload_team_logo(
    team_id: int,
    file: UploadFile = File(...),
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid image type")

    try:
        image = Image.open(file.file)
        image = image.convert("RGB")
        image = ImageOps.fit(image, (256, 256), Image.Resampling.LANCZOS)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to process image") from exc

    output = BytesIO()
    try:
        image.save(output, format="JPEG", quality=88)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to save image") from exc

    try:
        team.logo_image = output.getvalue()
        team.logo_updated_at = datetime.datetime.utcnow()
        commit_or_raise(db)
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to save image") from exc

    return {
        "logo_url": team_logo_url(
            team.id,
            has_db_logo=True,
            logo_updated_at=team.logo_updated_at,
        )
    }


@router.get("/games")
def list_games(_: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    games = db.query(Game).order_by(Game.date.asc(), Game.time.asc()).all()
    return [serialize_game(game) for game in games]


@router.get("/games/{game_id}/lineup", response_model=GameLineupOut)
def get_game_lineup(
    game_id: int,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return build_game_lineup_payload(game_id, db)


@router.put("/games/{game_id}/lineup", response_model=GameLineupOut)
def save_game_lineup(
    game_id: int,
    payload: GameLineupUpdate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    allowed_team_ids = {game.home_team_id, game.away_team_id}
    requested_player_ids = sorted(set(payload.player_ids))
    players = []
    if requested_player_ids:
        players = (
            db.query(Player)
            .filter(Player.id.in_(requested_player_ids))
            .all()
        )
        if len(players) != len(requested_player_ids):
            raise HTTPException(status_code=404, detail="One or more players were not found")

        invalid_players = [
            player for player in players if player.team_id not in allowed_team_ids
        ]
        if invalid_players:
            raise HTTPException(
                status_code=400,
                detail="Lineup players must belong to one of the teams in this game",
            )

    db.query(PlayerAppearance).filter(PlayerAppearance.game_id == game_id).delete(
        synchronize_session=False
    )
    for player in players:
        db.add(
            PlayerAppearance(
                player_id=player.id,
                game_id=game_id,
                team_id=player.team_id,
            )
        )

    commit_or_raise(db)
    return build_game_lineup_payload(game_id, db)


@router.get("/eligibility-report", response_model=list[EligibilityReportItem])
def get_eligibility_report(
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    counts = {
        player_id: total_games_played
        for player_id, total_games_played in (
            db.query(
                PlayerAppearance.player_id,
                func.count(PlayerAppearance.id),
            )
            .group_by(PlayerAppearance.player_id)
            .all()
        )
    }
    minimum_required_games = settings.playoff_minimum_games
    players = (
        db.query(Player, Team)
        .join(Team, Player.team_id == Team.id)
        .order_by(Team.name.asc(), Player.last_name.asc(), Player.first_name.asc())
        .all()
    )
    return [
        {
            "player_id": player.id,
            "player_name": f"{player.first_name} {player.last_name}",
            "team_id": team.id,
            "team_name": team.name,
            "total_games_played": counts.get(player.id, 0),
            "minimum_required_games": minimum_required_games,
            "eligible": counts.get(player.id, 0) >= minimum_required_games,
        }
        for player, team in players
    ]


@router.post("/games")
def create_game(
    payload: GameCreate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if payload.home_team_id == payload.away_team_id:
        raise HTTPException(status_code=400, detail="Teams must be different")

    home_team = db.get(Team, payload.home_team_id)
    away_team = db.get(Team, payload.away_team_id)
    if not home_team or not away_team:
        raise HTTPException(status_code=404, detail="Team not found")

    season = db.query(Season).order_by(Season.year.desc()).first()
    if not season:
        raise HTTPException(status_code=400, detail="No season configured")

    game = Game(
        season_id=season.id,
        date=payload.date,
        time=payload.time,
        field=payload.field,
        home_team_id=payload.home_team_id,
        away_team_id=payload.away_team_id,
        home_score=payload.home_score,
        away_score=payload.away_score,
        status=payload.status,
    )
    db.add(game)
    commit_or_raise(db)
    db.refresh(game)
    return serialize_game(game)


@router.patch("/games/{game_id}")
def update_game(
    game_id: int,
    payload: GameUpdate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    original_home_team_id = game.home_team_id
    original_away_team_id = game.away_team_id
    home_team_id = payload.home_team_id if payload.home_team_id is not None else game.home_team_id
    away_team_id = payload.away_team_id if payload.away_team_id is not None else game.away_team_id
    if home_team_id == away_team_id:
        raise HTTPException(status_code=400, detail="Teams must be different")

    if payload.home_team_id is not None and not db.get(Team, payload.home_team_id):
        raise HTTPException(status_code=404, detail="Home team not found")
    if payload.away_team_id is not None and not db.get(Team, payload.away_team_id):
        raise HTTPException(status_code=404, detail="Away team not found")

    if payload.date is not None:
        game.date = payload.date
    if payload.time is not None:
        game.time = payload.time
    if payload.field is not None:
        game.field = payload.field
    if payload.home_team_id is not None:
        game.home_team_id = payload.home_team_id
    if payload.away_team_id is not None:
        game.away_team_id = payload.away_team_id
    if payload.status is not None:
        game.status = payload.status
    if payload.home_score is not None:
        game.home_score = payload.home_score
    if payload.away_score is not None:
        game.away_score = payload.away_score

    if home_team_id != original_home_team_id or away_team_id != original_away_team_id:
        db.query(PlayerAppearance).filter(PlayerAppearance.game_id == game_id).delete(
            synchronize_session=False
        )

    commit_or_raise(db)
    db.refresh(game)
    return serialize_game(game)


@router.delete("/games/{game_id}")
def delete_game(
    game_id: int,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    game = db.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    db.query(PlayerAppearance).filter(PlayerAppearance.game_id == game_id).delete(
        synchronize_session=False
    )
    db.delete(game)
    commit_or_raise(db)
    return {"ok": True}


@router.delete("/games")
def delete_all_games(
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    db.query(PlayerAppearance).delete(synchronize_session=False)
    db.query(Game).delete(synchronize_session=False)
    commit_or_raise(db)
    return {"ok": True}


@router.get("/teams/{team_id}/players")
def list_team_players(
    team_id: int,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
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


@router.post("/teams/{team_id}/players")
def create_player(
    team_id: int,
    payload: PlayerCreate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    first_name = payload.first_name.strip()
    last_name = payload.last_name.strip()
    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="First and last name are required")

    duplicate = (
        db.query(Player)
        .filter(
            Player.team_id == team_id,
            Player.first_name == first_name,
            Player.last_name == last_name,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Player already exists on this team")

    player = Player(
        team_id=team_id,
        first_name=first_name,
        last_name=last_name,
        number=payload.number,
        position=payload.position,
        bats=payload.bats,
        throws=payload.throws,
    )
    db.add(player)
    commit_or_raise(db, conflict_detail="Player already exists on this team")
    db.refresh(player)
    return serialize_player(player)


@router.patch("/players/{player_id}")
def update_player(
    player_id: int,
    payload: PlayerUpdate,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    next_team_id = payload.team_id if payload.team_id is not None else player.team_id
    next_first_name = payload.first_name.strip() if payload.first_name is not None else player.first_name
    next_last_name = payload.last_name.strip() if payload.last_name is not None else player.last_name
    if not next_first_name or not next_last_name:
        raise HTTPException(status_code=400, detail="First and last name are required")

    if payload.team_id is not None:
        team = db.get(Team, payload.team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        player.team_id = payload.team_id

    duplicate = (
        db.query(Player)
        .filter(
            Player.id != player_id,
            Player.team_id == next_team_id,
            Player.first_name == next_first_name,
            Player.last_name == next_last_name,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Player already exists on this team")

    if payload.first_name is not None:
        player.first_name = next_first_name
    if payload.last_name is not None:
        player.last_name = next_last_name
    if payload.number is not None:
        player.number = payload.number
    if payload.position is not None:
        player.position = payload.position
    if payload.bats is not None:
        player.bats = payload.bats
    if payload.throws is not None:
        player.throws = payload.throws

    commit_or_raise(db, conflict_detail="Player already exists on this team")
    db.refresh(player)
    return serialize_player(player)


@router.post("/players/{player_id}/image")
def upload_player_image(
    player_id: int,
    file: UploadFile = File(...),
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid image type")

    try:
        image = Image.open(file.file)
        image = image.convert("RGB")
        image = ImageOps.fit(image, (480, 600), Image.Resampling.LANCZOS)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to process image") from exc

    output = BytesIO()
    try:
        image.save(output, format="JPEG", quality=88)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to save image") from exc

    try:
        player.photo_image = output.getvalue()
        player.photo_updated_at = datetime.datetime.utcnow()
        commit_or_raise(db)
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to save image") from exc

    return {
        "image_url": player_image_url(
            player.id,
            has_db_image=True,
            image_updated_at=player.photo_updated_at,
        )
    }


@router.delete("/players/{player_id}")
def delete_player(
    player_id: int,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    db.query(PlayerAppearance).filter(PlayerAppearance.player_id == player_id).delete(
        synchronize_session=False
    )
    db.delete(player)
    commit_or_raise(db)
    return {"ok": True}
