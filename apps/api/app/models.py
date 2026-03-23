from sqlalchemy import (
    String, Integer, Date, DateTime, Text, ForeignKey, Boolean, LargeBinary,
    UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime
from .db import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

class Season(Base):
    __tablename__ = "seasons"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String, default="Regular Season")

class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    home_field: Mapped[str | None] = mapped_column(String, nullable=True)
    logo_image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    logo_updated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    players: Mapped[list["Player"]] = relationship(back_populates="team")
    appearances: Mapped[list["PlayerAppearance"]] = relationship(back_populates="team")

class Player(Base):
    __tablename__ = "players"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[str | None] = mapped_column(String, nullable=True)
    bats: Mapped[str | None] = mapped_column(String, nullable=True)   # R/L/S
    throws: Mapped[str | None] = mapped_column(String, nullable=True) # R/L
    photo_image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    photo_updated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    team: Mapped[Team] = relationship(back_populates="players")
    appearances: Mapped[list["PlayerAppearance"]] = relationship(back_populates="player")

    __table_args__ = (
        UniqueConstraint("team_id", "first_name", "last_name", name="uq_player_team_name"),
    )

class Game(Base):
    __tablename__ = "games"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"))
    date: Mapped[Date] = mapped_column(Date)
    time: Mapped[str | None] = mapped_column(String, nullable=True)
    field: Mapped[str | None] = mapped_column(String, nullable=True)

    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))

    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String, default="SCHEDULED")  # SCHEDULED|FINAL
    appearances: Mapped[list["PlayerAppearance"]] = relationship(back_populates="game")


class PlayerAppearance(Base):
    __tablename__ = "player_appearances"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    recorded_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )

    player: Mapped[Player] = relationship(back_populates="appearances")
    game: Mapped[Game] = relationship(back_populates="appearances")
    team: Mapped[Team] = relationship(back_populates="appearances")

    __table_args__ = (
        UniqueConstraint("player_id", "game_id", name="uq_player_game_appearance"),
    )


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
