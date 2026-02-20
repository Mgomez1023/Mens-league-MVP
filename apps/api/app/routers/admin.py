import datetime
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from ..deps import get_db, get_current_admin
from ..models import Game, Player, Season, Team, User
from ..standings import compute_team_records
from ..storage import team_logo_path, team_logo_url

router = APIRouter(prefix="/admin", tags=["admin"])

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
    db.commit()
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
        db.query(Game).filter(
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id)
        ).delete(synchronize_session=False)
        db.query(Player).filter(Player.team_id == team_id).delete(synchronize_session=False)

    db.delete(team)
    db.commit()
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

    output.seek(0)
    path = team_logo_path(team_id)
    tmp_path = path.with_suffix(".tmp")
    try:
        with open(tmp_path, "wb") as handle:
            handle.write(output.read())
        tmp_path.replace(path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except Exception:
                pass

    return {"logo_url": team_logo_url(team_id)}


@router.get("/games")
def list_games(_: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    games = db.query(Game).order_by(Game.date.asc(), Game.time.asc()).all()
    return [serialize_game(game) for game in games]


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
    db.commit()
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

    db.commit()
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
    db.delete(game)
    db.commit()
    return {"ok": True}


@router.delete("/games")
def delete_all_games(
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    db.query(Game).delete(synchronize_session=False)
    db.commit()
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
    players = (
        db.query(Player)
        .filter(Player.team_id == team_id)
        .order_by(Player.last_name.asc(), Player.first_name.asc())
        .all()
    )
    return [serialize_player(player) for player in players]


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

    player = Player(
        team_id=team_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        number=payload.number,
        position=payload.position,
        bats=payload.bats,
        throws=payload.throws,
    )
    db.add(player)
    db.commit()
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

    if payload.team_id is not None:
        team = db.get(Team, payload.team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        player.team_id = payload.team_id

    if payload.first_name is not None:
        player.first_name = payload.first_name
    if payload.last_name is not None:
        player.last_name = payload.last_name
    if payload.number is not None:
        player.number = payload.number
    if payload.position is not None:
        player.position = payload.position
    if payload.bats is not None:
        player.bats = payload.bats
    if payload.throws is not None:
        player.throws = payload.throws

    db.commit()
    db.refresh(player)
    return serialize_player(player)


@router.delete("/players/{player_id}")
def delete_player(
    player_id: int,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(player)
    db.commit()
    return {"ok": True}
