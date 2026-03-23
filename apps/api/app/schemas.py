import datetime

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


class PostOut(BaseModel):
    id: int
    content: str
    author_name: str
    created_at: datetime.datetime
    image_url: str | None = None


class LineupPlayerOut(BaseModel):
    id: int
    team_id: int
    first_name: str
    last_name: str
    number: int | None = None
    position: str | None = None
    bats: str | None = None
    throws: str | None = None
    games_played: int = 0


class LineupTeamOut(BaseModel):
    team_id: int
    team_name: str
    players: list[LineupPlayerOut]


class GameLineupOut(BaseModel):
    game_id: int
    game_date: datetime.date
    matchup: str
    minimum_required_games: int
    selected_player_ids: list[int]
    home_team: LineupTeamOut
    away_team: LineupTeamOut


class GameLineupUpdate(BaseModel):
    player_ids: list[int] = Field(default_factory=list)


class PlayerAppearanceHistoryItem(BaseModel):
    game_id: int
    game_date: datetime.date
    matchup: str
    opponent_team_id: int | None = None
    opponent_team_name: str | None = None
    field: str | None = None
    status: str


class PlayerAppearanceSummaryOut(BaseModel):
    player_id: int
    player_name: str
    team_id: int
    team_name: str
    total_games_played: int
    minimum_required_games: int
    eligible: bool
    history: list[PlayerAppearanceHistoryItem]


class EligibilityReportItem(BaseModel):
    player_id: int
    player_name: str
    team_id: int
    team_name: str
    total_games_played: int
    minimum_required_games: int
    eligible: bool
