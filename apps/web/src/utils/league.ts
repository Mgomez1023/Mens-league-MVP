import i18n, { getCurrentLocale } from "../i18n";
import type { Game, Team } from "../api";

const FINAL_STANDINGS_STATUS_TOKENS = ["FINAL", "COMPLETE", "COMPLETED", "FINISHED"];
const NON_FINAL_STANDINGS_STATUSES = new Set([
  "SCHEDULED",
  "IN PROGRESS",
  "IN_PROGRESS",
  "POSTPONED",
  "CANCELLED",
]);

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function parseDateOnly(value: string) {
  const datePart = getDateOnlyKey(value);
  if (!datePart) return null;
  const date = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function getDateOnlyKey(value: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.includes("T") ? trimmed.split("T")[0] : trimmed.split(" ")[0];
}

export function parseGameDateTime(game: Pick<Game, "date" | "time">) {
  const date = parseDateOnly(game.date);
  if (!date) return null;
  if (game.time) {
    const parts = game.time.split(":");
    const hour = Number(parts[0]);
    const minute = Number(parts[1]?.slice(0, 2) ?? "0");
    if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
      date.setHours(hour, minute, 0, 0);
    }
  }
  return date;
}

function formatDateValue(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(getCurrentLocale(), options).format(date);
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = parseDateOnly(value) ?? new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateValue(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value?: string | null) {
  if (!value) return i18n.t("common.timeTbd");
  const trimmed = value.trim();
  if (!trimmed) return i18n.t("common.timeTbd");
  const parts = trimmed.split(":");
  if (parts.length < 2) return trimmed;
  const hour = Number(parts[0]);
  const minute = Number(parts[1].slice(0, 2));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return trimmed;
  const temp = new Date();
  temp.setHours(hour, minute, 0, 0);
  return temp.toLocaleTimeString(getCurrentLocale(), {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isFinalGame(status?: string | null) {
  return (status ?? "").toUpperCase() === "FINAL";
}

export function getGameScore(game: Pick<Game, "home_score" | "away_score">) {
  if (game.home_score == null || game.away_score == null) return null;
  return {
    away: game.away_score,
    home: game.home_score,
  };
}

export function formatFullGameDate(game: Pick<Game, "date">) {
  const date = parseDateOnly(game.date);
  if (!date) return formatDate(game.date);
  return formatDateValue(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getGameLocationName(game: Pick<Game, "field" | "location_name" | "park_name" | "venue_name">) {
  return firstNonEmpty(game.location_name, game.park_name, game.venue_name, game.field);
}

export function getGameAddress(game: Pick<Game, "address" | "location_address">) {
  return firstNonEmpty(game.location_address, game.address);
}

export function getGameFieldNumber(game: Pick<Game, "field_number">) {
  if (game.field_number == null) return null;
  const value = String(game.field_number).trim();
  return value ? value : null;
}

export function getGameShortLocation(
  game: Pick<Game, "field" | "location_name" | "park_name" | "venue_name" | "field_number">,
) {
  const location = getGameLocationName(game);
  const fieldNumber = getGameFieldNumber(game);

  if (location && fieldNumber) {
    const normalizedLocation = location.toLowerCase();
    const normalizedFieldNumber = fieldNumber.toLowerCase();
    if (
      normalizedLocation.includes(`field ${normalizedFieldNumber}`) ||
      normalizedLocation.includes(`#${normalizedFieldNumber}`)
    ) {
      return location;
    }
    return `${location} • ${i18n.t("games.fieldWithNumber", { number: fieldNumber })}`;
  }

  if (location) return location;
  if (fieldNumber) return i18n.t("games.fieldWithNumber", { number: fieldNumber });
  return i18n.t("common.locationTbd");
}

export function getGameNotes(game: Pick<Game, "notes">) {
  return firstNonEmpty(game.notes);
}

export function buildTeamMap(teams: Team[]) {
  return teams.reduce<Record<number, Team>>((acc, team) => {
    acc[team.id] = team;
    return acc;
  }, {});
}

export function getGameTeamData(
  game: Pick<Game, "home_team_id" | "away_team_id" | "home_team_name" | "away_team_name">,
  side: "home" | "away",
  teamMap: Record<number, Team>,
) {
  const teamId = side === "home" ? game.home_team_id : game.away_team_id;
  const customName = side === "home" ? game.home_team_name : game.away_team_name;
  const normalizedCustomName = customName?.trim();

  if (normalizedCustomName) {
    return { name: normalizedCustomName, team: null };
  }

  if (teamId != null) {
    const team = teamMap[teamId];
    if (team) {
      return { name: team.name, team };
    }
    return { name: i18n.t("common.teamFallback", { id: teamId }), team: null };
  }

  return { name: i18n.t("games.customTeamFallback"), team: null };
}

export function sortStandings(teams: Team[]) {
  return [...teams].sort((a, b) => {
    const rankA = a.rank ?? Number.POSITIVE_INFINITY;
    const rankB = b.rank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB && Number.isFinite(rankA) && Number.isFinite(rankB)) {
      return rankA - rankB;
    }

    const differentialDiff = (b.run_differential ?? 0) - (a.run_differential ?? 0);
    if (differentialDiff !== 0) return differentialDiff;
    const winsDiff = (b.wins ?? 0) - (a.wins ?? 0);
    if (winsDiff !== 0) return winsDiff;
    return a.name.localeCompare(b.name);
  });
}

function isFinalStandingsGame(game: Pick<Game, "status" | "home_score" | "away_score">) {
  if (game.home_score == null || game.away_score == null) return false;
  const normalizedStatus = (game.status ?? "").trim().toUpperCase();
  if (!normalizedStatus) return true;
  if (NON_FINAL_STANDINGS_STATUSES.has(normalizedStatus)) return false;
  return FINAL_STANDINGS_STATUS_TOKENS.some((token) => normalizedStatus.includes(token));
}

function applyStandingsRanks(teams: Team[]) {
  let previousRank = 0;
  let previousKey: string | null = null;

  return sortStandings(teams).map((team, index) => {
    const key = `${team.run_differential ?? 0}:${team.wins ?? 0}`;
    const rank = key === previousKey ? previousRank : index + 1;
    previousRank = rank;
    previousKey = key;
    return { ...team, rank };
  });
}

function hasComputedStandings(team: Team) {
  return (
    typeof team.games_played === "number" &&
    typeof team.winning_percentage === "number" &&
    typeof team.runs_for === "number" &&
    typeof team.runs_against === "number" &&
    typeof team.run_differential === "number"
  );
}

export function resolveStandings(teams: Team[], games: Game[]) {
  if (teams.every(hasComputedStandings)) {
    return applyStandingsRanks(teams);
  }

  const standingsMap = new Map<number, Team>(
    teams.map((team) => [
      team.id,
      {
        ...team,
        rank: undefined,
        games_played: 0,
        wins: 0,
        losses: 0,
        winning_percentage: 0,
        runs_for: 0,
        runs_against: 0,
        run_differential: 0,
      },
    ]),
  );

  for (const game of games) {
    if (!isFinalStandingsGame(game)) continue;
    if (game.home_team_id == null || game.away_team_id == null) continue;
    if (game.home_score == null || game.away_score == null) continue;

    const homeTeam = standingsMap.get(game.home_team_id);
    const awayTeam = standingsMap.get(game.away_team_id);
    if (!homeTeam || !awayTeam) continue;
    const homeScore = game.home_score;
    const awayScore = game.away_score;

    homeTeam.games_played = (homeTeam.games_played ?? 0) + 1;
    awayTeam.games_played = (awayTeam.games_played ?? 0) + 1;

    homeTeam.runs_for = (homeTeam.runs_for ?? 0) + homeScore;
    homeTeam.runs_against = (homeTeam.runs_against ?? 0) + awayScore;
    awayTeam.runs_for = (awayTeam.runs_for ?? 0) + awayScore;
    awayTeam.runs_against = (awayTeam.runs_against ?? 0) + homeScore;

    if (homeScore > awayScore) {
      homeTeam.wins = (homeTeam.wins ?? 0) + 1;
      awayTeam.losses = (awayTeam.losses ?? 0) + 1;
    } else if (awayScore > homeScore) {
      awayTeam.wins = (awayTeam.wins ?? 0) + 1;
      homeTeam.losses = (homeTeam.losses ?? 0) + 1;
    }
  }

  const computedTeams = [...standingsMap.values()].map((team) => {
    const gamesPlayed = team.games_played ?? 0;
    const runsFor = team.runs_for ?? 0;
    const runsAgainst = team.runs_against ?? 0;
    return {
      ...team,
      winning_percentage: gamesPlayed > 0 ? (team.wins ?? 0) / gamesPlayed : 0,
      run_differential: runsFor - runsAgainst,
    };
  });

  return applyStandingsRanks(computedTeams);
}

export function getSeasonLabel(games: Game[]) {
  const datedGame = games.find((game) => parseDateOnly(game.date));
  if (datedGame) {
    return `${parseDateOnly(datedGame.date)?.getFullYear()} Season`;
  }
  return `${new Date().getFullYear()} Season`;
}

export function getGameStatusMeta(status?: string | null) {
  const normalized = (status ?? "SCHEDULED").toUpperCase();
  switch (normalized) {
    case "FINAL":
      return { label: i18n.t("games.status.final"), tone: "success" as const };
    case "IN_PROGRESS":
      return { label: i18n.t("games.status.inProgress"), tone: "accent" as const };
    case "POSTPONED":
      return { label: i18n.t("games.status.postponed"), tone: "warning" as const };
    case "CANCELLED":
      return { label: i18n.t("games.status.cancelled"), tone: "danger" as const };
    default:
      return { label: i18n.t("games.status.scheduled"), tone: "neutral" as const };
  }
}

function buildScheduleWeekLabelMap(games: Game[]) {
  const sortedKeys = [...new Set(
    games
      .map((game) => getDateOnlyKey(game.date))
      .filter((value): value is string => Boolean(value)),
  )].sort((a, b) => {
    const dateA = parseDateOnly(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dateB = parseDateOnly(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return dateA - dateB;
  });

  return new Map(
    sortedKeys.map((key, index) => [key, i18n.t("games.weekLabel", { count: index })]),
  );
}

export function groupGamesByDate(games: Game[], referenceGames: Game[] = games) {
  const sorted = [...games].sort((a, b) => {
    const timeA = parseGameDateTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const timeB = parseGameDateTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return timeA - timeB || a.id - b.id;
  });
  const weekLabelMap = buildScheduleWeekLabelMap(referenceGames);

  const grouped: GameDateGroup[] = [];
  for (const game of sorted) {
    const key = getDateOnlyKey(game.date) ?? `game-${game.id}`;
    const label = weekLabelMap.get(key) ?? i18n.t("common.unscheduled");
    const last = grouped[grouped.length - 1];
    if (!last || last.key !== key) {
      grouped.push({ key, label, games: [game] });
    } else {
      last.games.push(game);
    }
  }
  return grouped;
}

export type GameDateGroup = {
  key: string;
  label: string;
  games: Game[];
};

export function getCurrentScheduleGroupKey(groups: GameDateGroup[], now = new Date()) {
  if (groups.length === 0) return null;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const datedGroups = groups.flatMap((group) => {
    const date = parseDateOnly(group.key);
    return date ? [{ group, date }] : [];
  });

  const todaysGroup = datedGroups.find(({ date }) => date.getTime() === today.getTime());
  if (todaysGroup) return todaysGroup.group.key;

  const upcomingGroup = datedGroups.find(({ date }) => date.getTime() > today.getTime());
  if (upcomingGroup) return upcomingGroup.group.key;

  return datedGroups[datedGroups.length - 1]?.group.key ?? groups[0].key;
}

export function getRecord(team: Team) {
  return `${team.wins ?? 0}-${team.losses ?? 0}`;
}

export function formatWinningPercentage(team: Team) {
  return (team.winning_percentage ?? 0).toFixed(3);
}

export function getUpcomingGames(games: Game[]) {
  const now = new Date();
  return [...games]
    .filter((game) => {
      const date = parseGameDateTime(game);
      return !!date && date >= now && !["FINAL", "CANCELLED"].includes((game.status ?? "").toUpperCase());
    })
    .sort((a, b) => {
      const timeA = parseGameDateTime(a)?.getTime() ?? 0;
      const timeB = parseGameDateTime(b)?.getTime() ?? 0;
      return timeA - timeB;
    });
}

export function getRecentResults(games: Game[]) {
  return [...games]
    .filter((game) => (game.status ?? "").toUpperCase() === "FINAL")
    .sort((a, b) => {
      const timeA = parseGameDateTime(a)?.getTime() ?? 0;
      const timeB = parseGameDateTime(b)?.getTime() ?? 0;
      return timeB - timeA;
    });
}

export function truncate(value: string, max = 180) {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
}
