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
    games_behind: float
    runs_for: int
    runs_against: int
    run_differential: int


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
        home_score = game.home_score
        away_score = game.away_score
        if home_score is None or away_score is None:
            continue
        if game.home_team_id in records:
            apply_game_result(
                records[game.home_team_id],
                runs_for=home_score,
                runs_against=away_score,
            )

        if game.away_team_id in records:
            apply_game_result(
                records[game.away_team_id],
                runs_for=away_score,
                runs_against=home_score,
            )

    for record in records.values():
        record["run_differential"] = record["runs_for"] - record["runs_against"]
        games_played = record["games_played"]
        record["winning_percentage"] = (
            record["wins"] / games_played
            if games_played > 0
            else 0.0
        )

    apply_games_behind(records)

    return records


def apply_game_result(record: StandingsRecord, *, runs_for: int, runs_against: int):
    record["games_played"] += 1
    record["runs_for"] += runs_for
    record["runs_against"] += runs_against
    if runs_for > runs_against:
        record["wins"] += 1
    elif runs_against > runs_for:
        record["losses"] += 1


def apply_games_behind(records: dict[int, StandingsRecord]):
    if not any(record["games_played"] > 0 for record in records.values()):
        for record in records.values():
            record["games_behind"] = 0.0
        return

    leader = min(records.values(), key=get_standings_sort_values)
    for record in records.values():
        record["games_behind"] = (
            (leader["wins"] - record["wins"])
            + (record["losses"] - leader["losses"])
        ) / 2


def get_standings_sort_values(record: StandingsRecord):
    return (
        -record["winning_percentage"],
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
    previous_values: tuple[float, int, int, int] | None = None

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
