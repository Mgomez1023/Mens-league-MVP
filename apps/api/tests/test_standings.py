import datetime
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Game, Season, Team
from app.standings import build_empty_record, build_standings_rank_map, compute_team_records, compute_team_standings


class StandingsEngineTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.season = Season(year=2026, name="Test Season")
        self.db.add(self.season)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def add_team(self, name: str) -> Team:
        team = Team(name=name)
        self.db.add(team)
        self.db.flush()
        return team

    def add_game(
        self,
        *,
        home_team_id: int | None,
        away_team_id: int | None,
        home_score: int | None = None,
        away_score: int | None = None,
        status: str = "FINAL",
        home_team_name: str | None = None,
        away_team_name: str | None = None,
        forfeit_winner: str | None = None,
        counts_for_record: bool = True,
        counts_for_runs: bool = True,
        standings_note: str | None = None,
    ) -> Game:
        game = Game(
            season_id=self.season.id,
            date=datetime.date(2026, 5, 1),
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            home_team_name=home_team_name,
            away_team_name=away_team_name,
            home_score=home_score,
            away_score=away_score,
            status=status,
            forfeit_winner=forfeit_winner,
            counts_for_record=counts_for_record,
            counts_for_runs=counts_for_runs,
            standings_note=standings_note,
        )
        self.db.add(game)
        self.db.flush()
        return game

    def test_empty_standings_returns_zero_records(self):
        team = self.add_team("A")

        records = compute_team_standings(self.db, [team.id])

        self.assertEqual(records[team.id], build_empty_record())

    def test_native_vs_native_completed_game_counts_for_both_teams(self):
        home = self.add_team("Home")
        away = self.add_team("Away")
        self.add_game(
            home_team_id=home.id,
            away_team_id=away.id,
            home_score=6,
            away_score=2,
        )

        records = compute_team_standings(self.db, [home.id, away.id])

        self.assertEqual(records[home.id]["games_played"], 1)
        self.assertEqual(records[home.id]["wins"], 1)
        self.assertEqual(records[home.id]["losses"], 0)
        self.assertEqual(records[home.id]["runs_for"], 6)
        self.assertEqual(records[home.id]["runs_against"], 2)
        self.assertEqual(records[home.id]["run_differential"], 4)
        self.assertEqual(records[home.id]["winning_percentage"], 1.0)
        self.assertEqual(records[home.id]["games_behind"], 0.0)

        self.assertEqual(records[away.id]["games_played"], 1)
        self.assertEqual(records[away.id]["wins"], 0)
        self.assertEqual(records[away.id]["losses"], 1)
        self.assertEqual(records[away.id]["runs_for"], 2)
        self.assertEqual(records[away.id]["runs_against"], 6)
        self.assertEqual(records[away.id]["run_differential"], -4)
        self.assertEqual(records[away.id]["winning_percentage"], 0.0)
        self.assertEqual(records[away.id]["games_behind"], 1.0)

    def test_native_vs_outside_completed_game_counts_for_native_team_only(self):
        native = self.add_team("Native")
        outside = self.add_team("Outside")
        self.add_game(
            home_team_id=native.id,
            away_team_id=None,
            away_team_name="Plain Name Opponent",
            home_score=5,
            away_score=2,
        )
        self.add_game(
            home_team_id=outside.id,
            away_team_id=native.id,
            home_score=3,
            away_score=1,
        )

        records = compute_team_standings(self.db, [native.id])

        self.assertEqual(set(records), {native.id})
        self.assertEqual(records[native.id]["games_played"], 2)
        self.assertEqual(records[native.id]["wins"], 1)
        self.assertEqual(records[native.id]["losses"], 1)
        self.assertEqual(records[native.id]["runs_for"], 6)
        self.assertEqual(records[native.id]["runs_against"], 5)

    def test_outside_vs_outside_games_are_ignored(self):
        native = self.add_team("Native")
        outside_a = self.add_team("Outside A")
        outside_b = self.add_team("Outside B")
        self.add_game(
            home_team_id=outside_a.id,
            away_team_id=outside_b.id,
            home_score=9,
            away_score=1,
        )
        self.add_game(
            home_team_id=None,
            away_team_id=None,
            home_team_name="Plain A",
            away_team_name="Plain B",
            home_score=5,
            away_score=4,
        )

        records = compute_team_standings(self.db, [native.id])

        self.assertEqual(records[native.id], build_empty_record())

    def test_forfeit_uses_official_nine_zero_result(self):
        home = self.add_team("Home")
        away = self.add_team("Away")
        self.add_game(
            home_team_id=home.id,
            away_team_id=away.id,
            status="FORFEIT",
            forfeit_winner="HOME",
        )

        records = compute_team_standings(self.db, [home.id, away.id])

        self.assertEqual(records[home.id]["games_played"], 1)
        self.assertEqual(records[home.id]["wins"], 1)
        self.assertEqual(records[home.id]["runs_for"], 9)
        self.assertEqual(records[home.id]["runs_against"], 0)
        self.assertEqual(records[away.id]["games_played"], 1)
        self.assertEqual(records[away.id]["losses"], 1)
        self.assertEqual(records[away.id]["runs_for"], 0)
        self.assertEqual(records[away.id]["runs_against"], 9)

    def test_tie_counts_runs_only(self):
        home = self.add_team("Home")
        away = self.add_team("Away")
        self.add_game(
            home_team_id=home.id,
            away_team_id=away.id,
            home_score=4,
            away_score=4,
        )

        records = compute_team_standings(self.db, [home.id, away.id])

        self.assertEqual(records[home.id]["games_played"], 0)
        self.assertEqual(records[home.id]["wins"], 0)
        self.assertEqual(records[home.id]["losses"], 0)
        self.assertEqual(records[home.id]["runs_for"], 4)
        self.assertEqual(records[home.id]["runs_against"], 4)
        self.assertEqual(records[away.id]["games_played"], 0)
        self.assertEqual(records[away.id]["runs_for"], 4)
        self.assertEqual(records[away.id]["runs_against"], 4)

    def test_missing_score_is_ignored_unless_forfeit(self):
        home = self.add_team("Home")
        away = self.add_team("Away")
        self.add_game(
            home_team_id=home.id,
            away_team_id=away.id,
            home_score=3,
            away_score=None,
        )

        records = compute_team_standings(self.db, [home.id, away.id])

        self.assertEqual(records[home.id], build_empty_record())
        self.assertEqual(records[away.id], build_empty_record())

    def test_scored_game_can_be_excluded_from_general_standings(self):
        home = self.add_team("Home")
        away = self.add_team("Away")
        game = self.add_game(
            home_team_id=home.id,
            away_team_id=away.id,
            home_score=10,
            away_score=2,
            counts_for_record=False,
            counts_for_runs=False,
            standings_note="RF/RA worksheet only",
        )

        records = compute_team_standings(self.db, [home.id, away.id])

        self.assertEqual(game.home_score, 10)
        self.assertEqual(game.away_score, 2)
        self.assertEqual(records[home.id], build_empty_record())
        self.assertEqual(records[away.id], build_empty_record())

    def test_postponed_makeup_and_unplayed_games_are_ignored(self):
        home = self.add_team("Home")
        away = self.add_team("Away")
        for status in ["SCHEDULED", "POSTPONED", "MAKE-UP", "CANCELLED", "IN_PROGRESS"]:
            self.add_game(
                home_team_id=home.id,
                away_team_id=away.id,
                home_score=10,
                away_score=1,
                status=status,
            )

        records = compute_team_standings(self.db, [home.id, away.id])

        self.assertEqual(records[home.id], build_empty_record())
        self.assertEqual(records[away.id], build_empty_record())

    def test_sorting_and_ranking_use_deterministic_standings_order(self):
        alpha = self.add_team("Alpha")
        bravo = self.add_team("Bravo")
        charlie = self.add_team("Charlie")
        records = {
            alpha.id: {
                **build_empty_record(),
                "games_played": 2,
                "wins": 1,
                "losses": 1,
                "winning_percentage": 0.5,
                "runs_for": 5,
                "runs_against": 5,
            },
            bravo.id: {
                **build_empty_record(),
                "games_played": 2,
                "wins": 1,
                "losses": 1,
                "winning_percentage": 0.5,
                "runs_for": 10,
                "runs_against": 10,
            },
            charlie.id: {
                **build_empty_record(),
                "games_played": 1,
                "wins": 0,
                "losses": 1,
                "winning_percentage": 0.0,
            },
        }
        for record in records.values():
            record["run_differential"] = record["runs_for"] - record["runs_against"]

        rank_map = build_standings_rank_map([alpha, bravo, charlie], records)

        self.assertEqual(rank_map[bravo.id], 1)
        self.assertEqual(rank_map[alpha.id], 2)
        self.assertEqual(rank_map[charlie.id], 3)

    def test_compute_team_records_returns_wins_and_losses_from_standings(self):
        home = self.add_team("Home")
        away = self.add_team("Away")
        self.add_game(
            home_team_id=home.id,
            away_team_id=away.id,
            home_score=8,
            away_score=7,
        )

        records = compute_team_records(self.db, [home.id, away.id])

        self.assertEqual(records[home.id], {"wins": 1, "losses": 0})
        self.assertEqual(records[away.id], {"wins": 0, "losses": 1})


if __name__ == "__main__":
    unittest.main()
