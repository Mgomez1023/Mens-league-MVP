import datetime
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Game, OfficialStanding, Season, Team
from app.routers.admin import OfficialStandingsUpdate, save_official_standings_payload
from app.standings import build_public_standings_view


class OfficialStandingsTestCase(unittest.TestCase):
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
        team = Team(name=name, is_visible=True)
        self.db.add(team)
        self.db.flush()
        return team

    def add_game(self, home: Team, away: Team, home_score: int, away_score: int):
        self.db.add(
            Game(
                season_id=self.season.id,
                date=datetime.date(2026, 5, 1),
                home_team_id=home.id,
                away_team_id=away.id,
                home_score=home_score,
                away_score=away_score,
                status="FINAL",
            )
        )
        self.db.flush()

    def test_public_standings_use_official_values_when_present(self):
        alpha = self.add_team("Alpha")
        beta = self.add_team("Beta")
        self.add_game(alpha, beta, 12, 1)
        self.db.add(
            OfficialStanding(
                team_id=beta.id,
                position=1,
                games_played=9,
                wins=8,
                losses=1,
                winning_percentage=0.889,
                games_behind=0.0,
                runs_for=99,
                runs_against=10,
                run_differential=89,
            )
        )
        self.db.flush()

        view = build_public_standings_view(self.db, [alpha, beta])

        self.assertEqual(view["records"][beta.id]["wins"], 8)
        self.assertEqual(view["records"][beta.id]["runs_for"], 99)

    def test_public_standings_fall_back_to_calculated_values_when_official_missing(self):
        alpha = self.add_team("Alpha")
        beta = self.add_team("Beta")
        self.add_game(alpha, beta, 12, 1)

        view = build_public_standings_view(self.db, [alpha, beta])

        self.assertFalse(view["using_official"])
        self.assertEqual(view["records"][alpha.id]["wins"], 1)
        self.assertEqual(view["records"][alpha.id]["runs_for"], 12)
        self.assertEqual(view["records"][beta.id]["losses"], 1)

    def test_admin_can_create_and_update_official_standings(self):
        team = self.add_team("Alpha")

        save_official_standings_payload(
            self.db,
            OfficialStandingsUpdate(
                standings=[
                    {
                        "team_id": team.id,
                        "position": 2,
                        "games_played": 7,
                        "wins": 4,
                        "losses": 3,
                        "winning_percentage": 0.571,
                        "games_behind": 4.0,
                        "runs_for": 42,
                        "runs_against": 25,
                        "run_differential": 17,
                    }
                ]
            ),
        )
        save_official_standings_payload(
            self.db,
            OfficialStandingsUpdate(
                standings=[
                    {
                        "team_id": team.id,
                        "position": 1,
                        "games_played": 8,
                        "wins": 5,
                        "losses": 3,
                        "winning_percentage": 0.625,
                        "games_behind": 3.5,
                        "runs_for": 44,
                        "runs_against": 26,
                        "run_differential": 18,
                    }
                ]
            ),
        )

        standings = self.db.query(OfficialStanding).all()
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0].position, 1)
        self.assertEqual(standings[0].runs_for, 44)

    def test_sorting_uses_official_position_when_official_standings_exist(self):
        alpha = self.add_team("Alpha")
        beta = self.add_team("Beta")
        self.add_game(alpha, beta, 12, 1)
        self.db.add_all(
            [
                OfficialStanding(team_id=alpha.id, position=2),
                OfficialStanding(team_id=beta.id, position=1),
            ]
        )
        self.db.flush()

        view = build_public_standings_view(self.db, [alpha, beta])

        self.assertEqual([team.name for team in view["ordered_teams"]], ["Beta", "Alpha"])
        self.assertEqual(view["rank_by_team_id"][beta.id], 1)
        self.assertEqual(view["rank_by_team_id"][alpha.id], 2)


if __name__ == "__main__":
    unittest.main()
