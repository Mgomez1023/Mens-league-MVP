from sqlalchemy import or_
from sqlalchemy.orm import Session

from .models import Game


def compute_team_records(db: Session, team_ids: list[int]):
    records: dict[int, dict[str, int]] = {team_id: {"wins": 0, "losses": 0} for team_id in team_ids}
    if not team_ids:
        return records

    games = (
        db.query(Game)
        .filter(or_(Game.home_team_id.in_(team_ids), Game.away_team_id.in_(team_ids)))
        .all()
    )

    for game in games:
        status = (game.status or "").upper()
        if status != "FINAL":
            continue
        if game.home_score is None or game.away_score is None:
            continue

        if game.home_score > game.away_score:
            records[game.home_team_id]["wins"] += 1
            records[game.away_team_id]["losses"] += 1
        elif game.away_score > game.home_score:
            records[game.away_team_id]["wins"] += 1
            records[game.home_team_id]["losses"] += 1

    return records
