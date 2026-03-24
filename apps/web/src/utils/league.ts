import i18n, { getCurrentLocale } from "../i18n";
import type { Game, Team } from "../api";

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

export function sortStandings(teams: Team[]) {
  return [...teams].sort((a, b) => {
    const winsDiff = (b.wins ?? 0) - (a.wins ?? 0);
    if (winsDiff !== 0) return winsDiff;
    const lossesDiff = (a.losses ?? 0) - (b.losses ?? 0);
    if (lossesDiff !== 0) return lossesDiff;
    return a.name.localeCompare(b.name);
  });
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

export function groupGamesByDate(games: Game[]) {
  const sorted = [...games].sort((a, b) => {
    const timeA = parseGameDateTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const timeB = parseGameDateTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return timeA - timeB || a.id - b.id;
  });

  const grouped: GameDateGroup[] = [];
  for (const game of sorted) {
    const date = parseDateOnly(game.date);
    const key = getDateOnlyKey(game.date) ?? `game-${game.id}`;
    const label = date
      ? formatDateValue(date, {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : i18n.t("common.unscheduled");
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
