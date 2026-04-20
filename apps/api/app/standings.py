from typing import TypedDict

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .models import Game, Team

FINAL_STATUS_TOKENS = ("FINAL", "COMPLETE", "COMPLETED", "FINISHED")
NON_FINAL_STATUSES = {
    "SCHEDULED",
    "IN PROGRESS",
    "IN_PROGRESS",
    "POSTPONED",
    "CANCELLED",
}


class StandingsRecord(TypedDict):
    games_played: int
    wins: int
    losses: int
    winning_percentage: float
    runs_for: int
    runs_against: int
    run_differential: int


def build_empty_record() -> StandingsRecord:
    return {
        "games_played": 0,
        "wins": 0,
        "losses": 0,
        "winning_percentage": 0.0,
        "runs_for": 0,
        "runs_against": 0,
        "run_differential": 0,
    }


def is_finalized_game(game: Game) -> bool:
    if game.home_score is None or game.away_score is None:
        return False

    normalized_status = (game.status or "").strip().upper()
    if not normalized_status:
        return True
    if normalized_status in NON_FINAL_STATUSES:
        return False
    return any(token in normalized_status for token in FINAL_STATUS_TOKENS)


def compute_team_standings(db: Session, team_ids: list[int]):
    records: dict[int, StandingsRecord] = {
        team_id: build_empty_record()
        for team_id in team_ids
    }
    if not team_ids:
        return records

    games = (
        db.query(Game)
        .filter(or_(Game.home_team_id.in_(team_ids), Game.away_team_id.in_(team_ids)))
        .all()
    )

    for game in games:
        if not is_finalized_game(game):
            continue
        if game.home_team_id not in records or game.away_team_id not in records:
            continue

        home_record = records[game.home_team_id]
        away_record = records[game.away_team_id]

        home_record["games_played"] += 1
        away_record["games_played"] += 1

        home_record["runs_for"] += game.home_score
        home_record["runs_against"] += game.away_score
        away_record["runs_for"] += game.away_score
        away_record["runs_against"] += game.home_score

        if game.home_score > game.away_score:
            home_record["wins"] += 1
            away_record["losses"] += 1
        elif game.away_score > game.home_score:
            away_record["wins"] += 1
            home_record["losses"] += 1

    for record in records.values():
        record["run_differential"] = record["runs_for"] - record["runs_against"]
        games_played = record["games_played"]
        record["winning_percentage"] = (
            record["wins"] / games_played
            if games_played > 0
            else 0.0
        )

    return records


def get_standings_sort_values(record: StandingsRecord):
    return (
        -record["wins"],
        record["losses"],
        -record["run_differential"],
    )


def sort_teams_by_standings(teams: list[Team], records: dict[int, StandingsRecord]):
    empty_record = build_empty_record()
    return sorted(
        teams,
        key=lambda team: (
            *get_standings_sort_values(records.get(team.id, empty_record)),
            team.name.lower(),
        ),
    )


def build_standings_rank_map(teams: list[Team], records: dict[int, StandingsRecord]):
    empty_record = build_empty_record()
    rank_by_team_id: dict[int, int] = {}
    previous_rank = 0
    previous_values: tuple[int, int, int] | None = None

    for index, team in enumerate(sort_teams_by_standings(teams, records), start=1):
        values = get_standings_sort_values(records.get(team.id, empty_record))
        if values == previous_values:
            rank = previous_rank
        else:
            rank = index
        rank_by_team_id[team.id] = rank
        previous_rank = rank
        previous_values = values

    return rank_by_team_id


def compute_team_records(db: Session, team_ids: list[int]):
    records = compute_team_standings(db, team_ids)
    return {
        team_id: {
            "wins": record["wins"],
            "losses": record["losses"],
        }
        for team_id, record in records.items()
    }
