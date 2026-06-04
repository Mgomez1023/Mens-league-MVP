import re
from typing import Literal, TypedDict

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .models import Game, OfficialStanding, Team

COMPLETED_STATUSES = {"FINAL", "COMPLETE", "COMPLETED"}
FORFEIT_STATUSES = {"FORFEIT", "FORFEITED", "FINAL_FORFEIT"}
UNPLAYED_STATUSES = {
    "",
    "SCHEDULED",
    "IN_PROGRESS",
    "INPROGRESS",
    "POSTPONED",
    "MAKE_UP",
    "MAKEUP",
    "CANCELLED",
    "CANCELED",
    "UNPLAYED",
}

ForfeitWinner = Literal["home", "away"]


class StandingsRecord(TypedDict):
    games_played: int
    wins: int
    losses: int
    winning_percentage: float
    games_behind: float
    runs_for: int
    runs_against: int
    run_differential: int


class StandingsAuditRow(TypedDict):
    game_id: int
    date: str
    opponent: str
    status: str
    score: str
    counts_for_record: bool
    counts_for_runs: bool
    record_contribution: str
    runs_for: int
    runs_against: int
    note: str | None


class PublicStandingsView(TypedDict):
    records: dict[int, StandingsRecord]
    rank_by_team_id: dict[int, int]
    ordered_teams: list[Team]
    using_official: bool


class OfficialStandingSeedRow(TypedDict):
    team_id: int
    position: int
    games_played: int
    wins: int
    losses: int
    winning_percentage: float
    games_behind: float
    runs_for: int
    runs_against: int
    run_differential: int
    note: str | None


WEEK8_OFFICIAL_STANDINGS = [
    {"team_name": "San Agustin", "position": 1, "games_played": 9, "wins": 9, "losses": 0, "winning_percentage": 1.000, "games_behind": 0.0, "runs_for": 80, "runs_against": 20, "run_differential": 60},
    {"team_name": "Chicago Aztecs", "position": 2, "games_played": 7, "wins": 5, "losses": 2, "winning_percentage": 0.714, "games_behind": 1.5, "runs_for": 57, "runs_against": 36, "run_differential": 21},
    {"team_name": "White Sox", "position": 3, "games_played": 8, "wins": 5, "losses": 3, "winning_percentage": 0.625, "games_behind": 3.5, "runs_for": 42, "runs_against": 43, "run_differential": -1},
    {"team_name": "Braves", "position": 4, "games_played": 7, "wins": 4, "losses": 3, "winning_percentage": 0.571, "games_behind": 4.0, "runs_for": 42, "runs_against": 25, "run_differential": 17},
    {"team_name": "La Aduana", "position": 5, "games_played": 8, "wins": 4, "losses": 4, "winning_percentage": 0.500, "games_behind": 4.5, "runs_for": 39, "runs_against": 40, "run_differential": -1},
    {"team_name": "La Barca", "position": 6, "games_played": 8, "wins": 4, "losses": 4, "winning_percentage": 0.500, "games_behind": 4.5, "runs_for": 37, "runs_against": 46, "run_differential": -9},
    {"team_name": "8-Ballers", "position": 7, "games_played": 8, "wins": 4, "losses": 4, "winning_percentage": 0.500, "games_behind": 4.5, "runs_for": 41, "runs_against": 44, "run_differential": -3},
    {"team_name": "Los Pajaros", "position": 8, "games_played": 6, "wins": 2, "losses": 4, "winning_percentage": 0.333, "games_behind": 5.5, "runs_for": 23, "runs_against": 74, "run_differential": -51},
    {"team_name": "Naranjeros", "position": 9, "games_played": 7, "wins": 2, "losses": 5, "winning_percentage": 0.286, "games_behind": 6.0, "runs_for": 17, "runs_against": 42, "run_differential": -25},
    {"team_name": "Venezuela", "position": 10, "games_played": 8, "wins": 1, "losses": 7, "winning_percentage": 0.125, "games_behind": 7.5, "runs_for": 22, "runs_against": 47, "run_differential": -25},
]

WEEK8_TEAM_ALIASES = {
    "chicagoaztecs": ["aztecs"],
    "8ballers": ["8ballers"],
    "lospajaros": ["pajaros"],
}


def build_empty_record() -> StandingsRecord:
    return {
        "games_played": 0,
        "wins": 0,
        "losses": 0,
        "winning_percentage": 0.0,
        "games_behind": 0.0,
        "runs_for": 0,
        "runs_against": 0,
        "run_differential": 0,
    }


def official_standing_to_record(standing: OfficialStanding) -> StandingsRecord:
    return {
        "games_played": standing.games_played,
        "wins": standing.wins,
        "losses": standing.losses,
        "winning_percentage": standing.winning_percentage,
        "games_behind": standing.games_behind,
        "runs_for": standing.runs_for,
        "runs_against": standing.runs_against,
        "run_differential": standing.run_differential,
    }


def get_official_standings_by_team_id(
    db: Session,
    team_ids: list[int],
) -> dict[int, OfficialStanding]:
    if not team_ids:
        return {}
    standings = (
        db.query(OfficialStanding)
        .filter(OfficialStanding.team_id.in_(team_ids))
        .order_by(OfficialStanding.position.asc(), OfficialStanding.id.asc())
        .all()
    )
    return {standing.team_id: standing for standing in standings}


def normalize_official_team_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def build_week8_official_seed_rows(teams: list[Team]) -> list[OfficialStandingSeedRow]:
    team_by_key = {normalize_official_team_key(team.name): team for team in teams}
    rows: list[OfficialStandingSeedRow] = []

    for seed in WEEK8_OFFICIAL_STANDINGS:
        seed_key = normalize_official_team_key(str(seed["team_name"]))
        candidate_keys = [seed_key, *WEEK8_TEAM_ALIASES.get(seed_key, [])]
        team = next((team_by_key[key] for key in candidate_keys if key in team_by_key), None)
        if not team:
            continue
        rows.append(
            {
                "team_id": team.id,
                "position": int(seed["position"]),
                "games_played": int(seed["games_played"]),
                "wins": int(seed["wins"]),
                "losses": int(seed["losses"]),
                "winning_percentage": float(seed["winning_percentage"]),
                "games_behind": float(seed["games_behind"]),
                "runs_for": int(seed["runs_for"]),
                "runs_against": int(seed["runs_against"]),
                "run_differential": int(seed["run_differential"]),
                "note": "Week 8 official Facebook standings",
            }
        )

    return rows


def build_public_standings_view(db: Session, teams: list[Team]) -> PublicStandingsView:
    team_ids = [team.id for team in teams]
    calculated_records = compute_team_standings(db, team_ids)
    official_by_team_id = get_official_standings_by_team_id(db, team_ids)

    if not official_by_team_id:
        rank_by_team_id = build_standings_rank_map(teams, calculated_records)
        ordered_teams = sorted(
            teams,
            key=lambda team: rank_by_team_id.get(team.id, len(teams) + 1),
        )
        return {
            "records": calculated_records,
            "rank_by_team_id": rank_by_team_id,
            "ordered_teams": ordered_teams,
            "using_official": False,
        }

    records = {
        team_id: official_standing_to_record(official_by_team_id[team_id])
        if team_id in official_by_team_id
        else calculated_records.get(team_id, build_empty_record())
        for team_id in team_ids
    }
    calculated_rank_by_team_id = build_standings_rank_map(teams, calculated_records)
    max_official_position = max(
        (standing.position for standing in official_by_team_id.values()),
        default=0,
    )
    rank_by_team_id = {
        team.id: official_by_team_id[team.id].position
        if team.id in official_by_team_id
        else max_official_position + calculated_rank_by_team_id.get(team.id, len(teams) + 1)
        for team in teams
    }
    ordered_teams = sorted(
        teams,
        key=lambda team: (
            0 if team.id in official_by_team_id else 1,
            rank_by_team_id.get(team.id, len(teams) + 1),
            team.name.casefold(),
        ),
    )
    return {
        "records": records,
        "rank_by_team_id": rank_by_team_id,
        "ordered_teams": ordered_teams,
        "using_official": True,
    }


def normalize_status(status: str | None) -> str:
    return (status or "").strip().upper().replace("-", "_").replace(" ", "_")


def normalize_forfeit_winner(value: str | None) -> ForfeitWinner | None:
    normalized = (value or "").strip().upper()
    if normalized in {"HOME", "H", "HOME_TEAM"}:
        return "home"
    if normalized in {"AWAY", "A", "AWAY_TEAM"}:
        return "away"
    return None


def is_unplayed_status(status: str | None) -> bool:
    return normalize_status(status) in UNPLAYED_STATUSES


def is_completed_status(status: str | None) -> bool:
    return normalize_status(status) in COMPLETED_STATUSES


def is_forfeit_status(status: str | None) -> bool:
    return normalize_status(status) in FORFEIT_STATUSES


def get_forfeit_winner(game: Game) -> ForfeitWinner | None:
    winner = normalize_forfeit_winner(game.forfeit_winner)
    if winner is None or is_unplayed_status(game.status):
        return None
    if is_forfeit_status(game.status) or game.home_score is None or game.away_score is None:
        return winner
    return winner


def compute_team_standings(
    db: Session,
    team_ids: list[int],
    *,
    league_team_ids: list[int] | None = None,
) -> dict[int, StandingsRecord]:
    records = {team_id: build_empty_record() for team_id in team_ids}
    native_team_ids = set(league_team_ids if league_team_ids is not None else team_ids)
    if not records or not native_team_ids:
        return records

    games = (
        db.query(Game)
        .filter(or_(Game.home_team_id.in_(native_team_ids), Game.away_team_id.in_(native_team_ids)))
        .order_by(Game.date.asc(), Game.time.asc(), Game.id.asc())
        .all()
    )

    for game in games:
        apply_game_to_records(game, records, native_team_ids)

    finalize_records(records)
    return records


def apply_game_to_records(
    game: Game,
    records: dict[int, StandingsRecord],
    native_team_ids: set[int],
):
    home_team_id = game.home_team_id
    away_team_id = game.away_team_id
    home_native = home_team_id in native_team_ids
    away_native = away_team_id in native_team_ids
    if not home_native and not away_native:
        return

    forfeit_winner = get_forfeit_winner(game)
    if forfeit_winner:
        home_runs = 9 if forfeit_winner == "home" else 0
        away_runs = 9 if forfeit_winner == "away" else 0
        apply_side_result(
            records,
            home_team_id,
            native_team_ids,
            runs_for=home_runs,
            runs_against=away_runs,
            won=forfeit_winner == "home" if game.counts_for_record else None,
            counts_for_runs=game.counts_for_runs,
        )
        apply_side_result(
            records,
            away_team_id,
            native_team_ids,
            runs_for=away_runs,
            runs_against=home_runs,
            won=forfeit_winner == "away" if game.counts_for_record else None,
            counts_for_runs=game.counts_for_runs,
        )
        return

    if not is_completed_status(game.status):
        return
    if game.home_score is None or game.away_score is None:
        return

    home_score = game.home_score
    away_score = game.away_score
    is_tie = home_score == away_score

    apply_side_result(
        records,
        home_team_id,
        native_team_ids,
        runs_for=home_score,
        runs_against=away_score,
        won=None if is_tie or not game.counts_for_record else home_score > away_score,
        counts_for_runs=game.counts_for_runs,
    )
    apply_side_result(
        records,
        away_team_id,
        native_team_ids,
        runs_for=away_score,
        runs_against=home_score,
        won=None if is_tie or not game.counts_for_record else away_score > home_score,
        counts_for_runs=game.counts_for_runs,
    )


def apply_side_result(
    records: dict[int, StandingsRecord],
    team_id: int | None,
    native_team_ids: set[int],
    *,
    runs_for: int,
    runs_against: int,
    won: bool | None,
    counts_for_runs: bool,
):
    if team_id is None or team_id not in native_team_ids or team_id not in records:
        return

    record = records[team_id]
    if counts_for_runs:
        record["runs_for"] += runs_for
        record["runs_against"] += runs_against
    if won is True:
        record["wins"] += 1
    elif won is False:
        record["losses"] += 1


def finalize_records(records: dict[int, StandingsRecord]):
    for record in records.values():
        record["games_played"] = record["wins"] + record["losses"]
        record["winning_percentage"] = (
            record["wins"] / record["games_played"]
            if record["games_played"]
            else 0.0
        )
        record["run_differential"] = record["runs_for"] - record["runs_against"]

    if not records or not any(record["games_played"] > 0 for record in records.values()):
        for record in records.values():
            record["games_behind"] = 0.0
        return

    leader = min(records.values(), key=get_record_sort_values)
    leader_wins = leader["wins"]
    leader_losses = leader["losses"]
    for record in records.values():
        record["games_behind"] = (
            (leader_wins - record["wins"]) + (record["losses"] - leader_losses)
        ) / 2


def get_record_sort_values(record: StandingsRecord):
    return (
        -record["winning_percentage"],
        -record["wins"],
        -record["run_differential"],
        -record["runs_for"],
        record["runs_against"],
    )


def sort_teams_by_standings(
    teams: list[Team],
    records: dict[int, StandingsRecord],
) -> list[Team]:
    empty_record = build_empty_record()
    return sorted(
        teams,
        key=lambda team: (
            *get_record_sort_values(records.get(team.id, empty_record)),
            team.name.casefold(),
        ),
    )


def build_standings_rank_map(
    teams: list[Team],
    records: dict[int, StandingsRecord],
) -> dict[int, int]:
    return {
        team.id: index
        for index, team in enumerate(sort_teams_by_standings(teams, records), start=1)
    }


def get_team_name(team_id: int | None, teams_by_id: dict[int, Team], fallback: str | None) -> str:
    if team_id is not None and team_id in teams_by_id:
        return teams_by_id[team_id].name
    return fallback or "Outside opponent"


def build_team_standings_audit(
    db: Session,
    team_id: int,
    *,
    league_team_ids: list[int] | None = None,
) -> list[StandingsAuditRow]:
    native_team_ids = set(league_team_ids if league_team_ids is not None else [team_id])
    games = (
        db.query(Game)
        .filter(or_(Game.home_team_id == team_id, Game.away_team_id == team_id))
        .order_by(Game.date.asc(), Game.time.asc(), Game.id.asc())
        .all()
    )
    team_ids = {
        value
        for game in games
        for value in (game.home_team_id, game.away_team_id)
        if value is not None
    }
    teams = db.query(Team).filter(Team.id.in_(team_ids)).all() if team_ids else []
    teams_by_id = {team.id: team for team in teams}
    rows: list[StandingsAuditRow] = []

    for game in games:
        is_home = game.home_team_id == team_id
        opponent = (
            get_team_name(game.away_team_id, teams_by_id, game.away_team_name)
            if is_home
            else get_team_name(game.home_team_id, teams_by_id, game.home_team_name)
        )
        score = f"{game.home_score if game.home_score is not None else ''}-{game.away_score if game.away_score is not None else ''}"
        runs_for = 0
        runs_against = 0
        record_contribution = ""

        forfeit_winner = get_forfeit_winner(game)
        if team_id in native_team_ids and forfeit_winner:
            team_won = (forfeit_winner == "home") == is_home
            record_contribution = "W" if game.counts_for_record and team_won else "L" if game.counts_for_record else ""
            if game.counts_for_runs:
                runs_for = 9 if team_won else 0
                runs_against = 0 if team_won else 9
        elif (
            team_id in native_team_ids
            and is_completed_status(game.status)
            and game.home_score is not None
            and game.away_score is not None
        ):
            team_score = game.home_score if is_home else game.away_score
            opponent_score = game.away_score if is_home else game.home_score
            if game.counts_for_runs:
                runs_for = team_score
                runs_against = opponent_score
            if game.counts_for_record and team_score != opponent_score:
                record_contribution = "W" if team_score > opponent_score else "L"

        rows.append(
            {
                "game_id": game.id,
                "date": game.date.isoformat(),
                "opponent": opponent,
                "status": game.status,
                "score": score,
                "counts_for_record": game.counts_for_record,
                "counts_for_runs": game.counts_for_runs,
                "record_contribution": record_contribution,
                "runs_for": runs_for,
                "runs_against": runs_against,
                "note": game.standings_note,
            }
        )

    return rows


def compute_team_records(db: Session, team_ids: list[int]):
    records = compute_team_standings(db, team_ids)
    return {
        team_id: {
            "wins": record["wins"],
            "losses": record["losses"],
        }
        for team_id, record in records.items()
    }
