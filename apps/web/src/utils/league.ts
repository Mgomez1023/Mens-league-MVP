import type { Game, Team } from "../api";

export function parseDateOnly(value: string) {
  if (!value) return null;
  const datePart = value.includes("T") ? value.split("T")[0] : value.split(" ")[0];
  const date = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
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

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value?: string | null) {
  if (!value) return "Time TBD";
  const trimmed = value.trim();
  if (!trimmed) return "Time TBD";
  const parts = trimmed.split(":");
  if (parts.length < 2) return trimmed;
  const hour = Number(parts[0]);
  const minute = Number(parts[1].slice(0, 2));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return trimmed;
  const temp = new Date();
  temp.setHours(hour, minute, 0, 0);
  return temp.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
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
      return { label: "Final", tone: "success" as const };
    case "IN_PROGRESS":
      return { label: "In progress", tone: "accent" as const };
    case "POSTPONED":
      return { label: "Postponed", tone: "warning" as const };
    case "CANCELLED":
      return { label: "Cancelled", tone: "danger" as const };
    default:
      return { label: "Scheduled", tone: "neutral" as const };
  }
}

export function groupGamesByDate(games: Game[]) {
  const sorted = [...games].sort((a, b) => {
    const timeA = parseGameDateTime(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const timeB = parseGameDateTime(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return timeA - timeB || a.id - b.id;
  });

  const grouped: Array<{ key: string; label: string; games: Game[] }> = [];
  for (const game of sorted) {
    const date = parseDateOnly(game.date);
    const key = date ? date.toISOString().slice(0, 10) : `game-${game.id}`;
    const label = date
      ? date.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Unscheduled";
    const last = grouped[grouped.length - 1];
    if (!last || last.key !== key) {
      grouped.push({ key, label, games: [game] });
    } else {
      last.games.push(game);
    }
  }
  return grouped;
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
