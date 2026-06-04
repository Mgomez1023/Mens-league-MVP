import csv
import datetime
import unittest
from io import BytesIO, StringIO

from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Game, Player, PlayerAppearance, Season, Team
from app.routers.admin import GAME_CSV_HEADERS, build_games_csv_export, import_admin_games_csv


class AdminGameCsvTestCase(unittest.TestCase):
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
        date: datetime.date,
        home_team_id: int | None,
        away_team_id: int | None,
        home_team_name: str | None = None,
        away_team_name: str | None = None,
        home_score: int | None = None,
        away_score: int | None = None,
        status: str = "SCHEDULED",
    ) -> Game:
        game = Game(
            season_id=self.season.id,
            date=date,
            time="09:00",
            field="Field 1",
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

    def upload(self, csv_text: str) -> UploadFile:
        return UploadFile(
            file=BytesIO(csv_text.encode("utf-8")),
            filename="games.csv",
        )

    def test_export_uses_expected_headers_and_resolved_team_names(self):
        home = self.add_team("Alpha")
        away = self.add_team("Beta")
        later = self.add_game(
            date=datetime.date(2026, 5, 17),
            home_team_id=home.id,
            away_team_id=away.id,
            home_team_name="Stale Home",
            away_team_name="Stale Away",
            home_score=8,
            away_score=6,
            status="FINAL",
        )
        earlier = self.add_game(
            date=datetime.date(2026, 5, 10),
            home_team_id=home.id,
            away_team_id=None,
            away_team_name="Free Text Opponent",
        )

        exported = build_games_csv_export(self.db)
        reader = csv.DictReader(StringIO(exported))
        rows = list(reader)

        self.assertEqual(reader.fieldnames, GAME_CSV_HEADERS)
        self.assertEqual([row["source_game_id"] for row in rows], [str(earlier.id), str(later.id)])
        self.assertEqual(rows[0]["home_team_name"], "Alpha")
        self.assertEqual(rows[0]["away_team_name"], "Free Text Opponent")
        self.assertEqual(rows[1]["home_team_name"], "Alpha")
        self.assertEqual(rows[1]["away_team_name"], "Beta")
        self.assertEqual(rows[1]["home_score"], "8")
        self.assertEqual(rows[1]["away_score"], "6")
        self.assertEqual(rows[1]["status"], "FINAL")

    def test_import_replaces_games_by_matching_local_team_names(self):
        alpha = self.add_team("Alpha")
        beta = self.add_team("Beta")
        existing = self.add_game(
            date=datetime.date(2026, 4, 1),
            home_team_id=alpha.id,
            away_team_id=beta.id,
        )
        player = Player(first_name="Test", last_name="Player", team_id=alpha.id)
        self.db.add(player)
        self.db.flush()
        self.db.add(PlayerAppearance(player_id=player.id, game_id=existing.id, team_id=alpha.id))
        self.db.commit()

        csv_text = "\r\n".join(
            [
                ",".join(GAME_CSV_HEADERS),
                "501,2026-05-10,09:30,Field 2,999,alpha,1000,BETA,7,5,FINAL",
                "502,2026-05-17,,Field 3,999,Alpha,1000,Beta,,,",
            ]
        )

        result = import_admin_games_csv(
            replace_existing=True,
            file=self.upload(csv_text),
            _=object(),
            db=self.db,
        )

        games = self.db.query(Game).order_by(Game.date.asc()).all()
        self.assertEqual(result, {"created": 2, "deleted": 1, "replace_existing": True})
        self.assertEqual(self.db.query(PlayerAppearance).count(), 0)
        self.assertEqual(len(games), 2)
        self.assertEqual(games[0].home_team_id, alpha.id)
        self.assertEqual(games[0].away_team_id, beta.id)
        self.assertEqual(games[0].time, "09:30")
        self.assertEqual(games[0].field, "Field 2")
        self.assertEqual(games[0].home_score, 7)
        self.assertEqual(games[0].away_score, 5)
        self.assertEqual(games[0].status, "FINAL")
        self.assertIsNone(games[1].time)
        self.assertIsNone(games[1].home_score)
        self.assertIsNone(games[1].away_score)
        self.assertEqual(games[1].status, "SCHEDULED")

    def test_import_validation_error_does_not_replace_existing_games(self):
        alpha = self.add_team("Alpha")
        beta = self.add_team("Beta")
        self.add_game(
            date=datetime.date(2026, 4, 1),
            home_team_id=alpha.id,
            away_team_id=beta.id,
        )
        self.db.commit()

        csv_text = "\r\n".join(
            [
                ",".join(GAME_CSV_HEADERS),
                "501,2026-05-10,09:30,Field 2,999,Missing Team,1000,Beta,7,5,FINAL",
            ]
        )

        with self.assertRaises(HTTPException) as ctx:
            import_admin_games_csv(
                replace_existing=True,
                file=self.upload(csv_text),
                _=object(),
                db=self.db,
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Missing Team", ctx.exception.detail)
        self.assertEqual(self.db.query(Game).count(), 1)


if __name__ == "__main__":
    unittest.main()
