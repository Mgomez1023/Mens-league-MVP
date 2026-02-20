from sqlalchemy import (
    String, Integer, Date, ForeignKey, Boolean,
    UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
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

    players: Mapped[list["Player"]] = relationship(back_populates="team")

class Player(Base):
    __tablename__ = "players"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[str | None] = mapped_column(String, nullable=True)
    bats: Mapped[str | None] = mapped_column(String, nullable=True)   # R/L/S
    throws: Mapped[str | None] = mapped_column(String, nullable=True) # R/L

    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    team: Mapped[Team] = relationship(back_populates="players")

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
