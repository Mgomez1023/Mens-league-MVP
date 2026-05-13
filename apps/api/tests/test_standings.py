import datetime
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Game, Season, Team
from app.standings import compute_team_standings


class StandingsTestCase(unittest.TestCase):
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

    def add_team(self, name: str, *, is_visible: bool = True) -> Team:
        team = Team(name=name, is_visible=is_visible)
        self.db.add(team)
        self.db.flush()
        return team

    def add_game(
        self,
        *,
        home_team_id: int | None,
        away_team_id: int | None,
        home_score: int | None,
        away_score: int | None,
        status: str = "FINAL",
        home_team_name: str | None = None,
        away_team_name: str | None = None,
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
        )
        self.db.add(game)
        self.db.flush()
        return game

    def test_finalized_external_opponent_games_count_for_visible_teams(self):
        team_a = self.add_team("A")
        team_b = self.add_team("B")
        team_c = self.add_team("C")

        self.add_game(
            home_team_id=team_a.id,
            away_team_id=team_b.id,
            home_score=10,
            away_score=5,
        )
        self.add_game(
            home_team_id=team_a.id,
            away_team_id=None,
            away_team_name="External",
            home_score=3,
            away_score=7,
        )
        self.add_game(
            home_team_id=team_b.id,
            away_team_id=None,
            away_team_name="External",
            home_score=8,
            away_score=1,
        )
        self.add_game(
            home_team_id=team_c.id,
            away_team_id=None,
            away_team_name="External",
            home_score=6,
            away_score=2,
            status="SCHEDULED",
        )
        self.add_game(
            home_team_id=team_c.id,
            away_team_id=None,
            away_team_name="External",
            home_score=None,
            away_score=2,
        )

        records = compute_team_standings(self.db, [team_a.id, team_b.id, team_c.id])

        self.assertEqual(records[team_a.id]["games_played"], 2)
        self.assertEqual(records[team_a.id]["wins"], 1)
        self.assertEqual(records[team_a.id]["losses"], 1)
        self.assertEqual(records[team_a.id]["runs_for"], 13)
        self.assertEqual(records[team_a.id]["runs_against"], 12)
        self.assertEqual(records[team_a.id]["run_differential"], 1)
        self.assertEqual(records[team_a.id]["winning_percentage"], 0.5)
        self.assertEqual(records[team_a.id]["games_behind"], 0.0)

        self.assertEqual(records[team_b.id]["games_played"], 2)
        self.assertEqual(records[team_b.id]["wins"], 1)
        self.assertEqual(records[team_b.id]["losses"], 1)
        self.assertEqual(records[team_b.id]["runs_for"], 13)
        self.assertEqual(records[team_b.id]["runs_against"], 11)
        self.assertEqual(records[team_b.id]["run_differential"], 2)
        self.assertEqual(records[team_b.id]["winning_percentage"], 0.5)
        self.assertEqual(records[team_b.id]["games_behind"], 0.0)

        self.assertEqual(records[team_c.id]["games_played"], 0)
        self.assertEqual(records[team_c.id]["wins"], 0)
        self.assertEqual(records[team_c.id]["losses"], 0)
        self.assertEqual(records[team_c.id]["runs_for"], 0)
        self.assertEqual(records[team_c.id]["runs_against"], 0)
        self.assertEqual(records[team_c.id]["run_differential"], 0)
        self.assertEqual(records[team_c.id]["winning_percentage"], 0.0)
        self.assertEqual(records[team_c.id]["games_behind"], 0.0)

    def test_non_visible_team_id_counts_for_visible_opponent_only(self):
        visible = self.add_team("Visible")
        hidden = self.add_team("Hidden", is_visible=False)

        self.add_game(
            home_team_id=visible.id,
            away_team_id=hidden.id,
            home_score=4,
            away_score=9,
        )

        records = compute_team_standings(self.db, [visible.id])

        self.assertEqual(records[visible.id]["games_played"], 1)
        self.assertEqual(records[visible.id]["wins"], 0)
        self.assertEqual(records[visible.id]["losses"], 1)
        self.assertEqual(records[visible.id]["runs_for"], 4)
        self.assertEqual(records[visible.id]["runs_against"], 9)
        self.assertNotIn(hidden.id, records)

    def test_null_home_team_id_counts_for_visible_away_team(self):
        visible = self.add_team("Visible")

        self.add_game(
            home_team_id=None,
            away_team_id=visible.id,
            home_team_name="External",
            home_score=2,
            away_score=6,
        )

        records = compute_team_standings(self.db, [visible.id])

        self.assertEqual(records[visible.id]["games_played"], 1)
        self.assertEqual(records[visible.id]["wins"], 1)
        self.assertEqual(records[visible.id]["losses"], 0)
        self.assertEqual(records[visible.id]["runs_for"], 6)
        self.assertEqual(records[visible.id]["runs_against"], 2)

    def test_visible_vs_visible_game_is_not_double_counted(self):
        team_a = self.add_team("A")
        team_b = self.add_team("B")

        self.add_game(
            home_team_id=team_a.id,
            away_team_id=team_b.id,
            home_score=10,
            away_score=5,
        )

        records = compute_team_standings(self.db, [team_a.id, team_b.id])

        self.assertEqual(records[team_a.id]["games_played"], 1)
        self.assertEqual(records[team_b.id]["games_played"], 1)
        self.assertEqual(
            records[team_a.id]["games_played"] + records[team_b.id]["games_played"],
            2,
        )

    def test_games_behind_preserves_half_games(self):
        leader = self.add_team("Leader")
        trailer = self.add_team("Trailer")

        self.add_game(
            home_team_id=leader.id,
            away_team_id=trailer.id,
            home_score=5,
            away_score=1,
        )
        self.add_game(
            home_team_id=leader.id,
            away_team_id=None,
            away_team_name="External",
            home_score=4,
            away_score=2,
        )
        self.add_game(
            home_team_id=leader.id,
            away_team_id=None,
            away_team_name="External",
            home_score=1,
            away_score=3,
        )
        self.add_game(
            home_team_id=trailer.id,
            away_team_id=None,
            away_team_name="External",
            home_score=7,
            away_score=0,
        )

        records = compute_team_standings(self.db, [leader.id, trailer.id])

        self.assertEqual(records[leader.id]["wins"], 2)
        self.assertEqual(records[leader.id]["losses"], 1)
        self.assertEqual(records[leader.id]["games_behind"], 0.0)
        self.assertEqual(records[trailer.id]["wins"], 1)
        self.assertEqual(records[trailer.id]["losses"], 1)
        self.assertEqual(records[trailer.id]["games_behind"], 0.5)

    def test_games_behind_is_zero_when_no_games_played(self):
        team_a = self.add_team("A")
        team_b = self.add_team("B")

        records = compute_team_standings(self.db, [team_a.id, team_b.id])

        self.assertEqual(records[team_a.id]["games_behind"], 0.0)
        self.assertEqual(records[team_b.id]["games_behind"], 0.0)


if __name__ == "__main__":
    unittest.main()
