const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE = (configuredApiBase || "http://127.0.0.1:8000").replace(/\/$/, "");
const TEAMS_CACHE_KEY = "teams_cache";
const GAMES_CACHE_KEY = "games_cache";

export type Team = {
  id: number;
  name: string;
  home_field?: string | null;
  wins?: number;
  losses?: number;
  logo_url?: string | null;
};

export type UserRole = "admin" | "manager";

export type Game = {
  id: number;
  date: string;
  time?: string | null;
  field?: string | null;
  location_name?: string | null;
  park_name?: string | null;
  venue_name?: string | null;
  address?: string | null;
  location_address?: string | null;
  field_number?: string | number | null;
  notes?: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  status: string;
};

export type Player = {
  id: number;
  team_id: number;
  first_name: string;
  last_name: string;
  number?: number | null;
  position?: string | null;
  bats?: string | null;
  throws?: string | null;
  image_url?: string | null;
  games_played?: number;
};

export type GameLineupTeam = {
  team_id: number;
  team_name: string;
  players: Player[];
};

export type GameLineup = {
  game_id: number;
  game_date: string;
  matchup: string;
  minimum_required_games: number;
  can_manage_both_teams: boolean;
  visible_team_ids: number[];
  editable_team_ids: number[];
  selected_player_ids: number[];
  home_team: GameLineupTeam;
  away_team: GameLineupTeam;
};

export type PlayerAppearanceHistoryItem = {
  game_id: number;
  game_date: string;
  matchup: string;
  opponent_team_id?: number | null;
  opponent_team_name?: string | null;
  field?: string | null;
  status: string;
};

export type PlayerAppearanceSummary = {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  total_games_played: number;
  minimum_required_games: number;
  eligible: boolean;
  history: PlayerAppearanceHistoryItem[];
};

export type EligibilityReportItem = {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  total_games_played: number;
  minimum_required_games: number;
  eligible: boolean;
};

export type Post = {
  id: number;
  content: string;
  author_name: string;
  created_at: string;
  image_url?: string | null;
};

export class AuthError extends Error {
  status: number;

  constructor(message = "Unauthorized", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export class PermissionError extends Error {
  status: number;
  detail?: string;

  constructor(message = "Forbidden", status = 403, detail?: string) {
    super(message);
    this.name = "PermissionError";
    this.status = status;
    this.detail = detail;
  }
}

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function resolveApiUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${API_BASE}${path}`;
  }
  return `${API_BASE}/${path}`;
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function clearToken() {
  localStorage.removeItem("token");
}

const UNAUTHORIZED_EVENT = "auth:unauthorized";

export function onUnauthorized(handler: () => void) {
  window.addEventListener(UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

function notifyUnauthorized() {
  clearToken();
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export type TokenClaims = {
  exp?: number;
  is_admin?: boolean;
  role?: string;
  team_id?: number | null;
  team_name?: string | null;
  email?: string | null;
};

export function getTokenClaims(token = getToken() ?? ""): TokenClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad) payload += "=".repeat(4 - pad);
    const decoded = JSON.parse(atob(payload));
    return decoded as TokenClaims;
  } catch {
    return null;
  }
}

export function isAdminClaim(claims: TokenClaims | null) {
  return claims?.is_admin === true || claims?.role === "admin";
}

export function isManagerClaim(claims: TokenClaims | null) {
  return claims?.role === "manager";
}

export function getRoleClaim(claims: TokenClaims | null): UserRole | null {
  if (isAdminClaim(claims)) return "admin";
  if (isManagerClaim(claims)) return "manager";
  return null;
}

export async function login(email: string, password: string) {
  const params = new URLSearchParams({ email, password });
  const res = await fetch(`${API_BASE}/auth/login?${params.toString()}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Login failed");
  return res.json() as Promise<{ access_token: string }>;
}

export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  if (!token) {
    throw new AuthError("Missing token", 401);
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });

  let detail: string | undefined;
  const readDetail = async () => {
    if (detail !== undefined) return detail;
    try {
      const data = await res.clone().json();
      if (data && typeof data.detail === "string") {
        detail = data.detail;
        return detail;
      }
    } catch {
      // ignore
    }
    try {
      const text = await res.text();
      detail = text || undefined;
    } catch {
      detail = undefined;
    }
    return detail;
  };

  if (res.status === 401) {
    notifyUnauthorized();
    throw new AuthError("Unauthorized", res.status);
  }
  if (res.status === 403) {
    throw new PermissionError((await readDetail()) || "Forbidden", res.status, detail);
  }
  if (!res.ok) {
    detail = await readDetail();
    throw new ApiError(detail || "Request failed", res.status, detail);
  }

  return res;
}

export async function fetchTeams() {
  const res = await authenticatedFetch(`${API_BASE}/admin/teams`);
  const data = (await res.json()) as Team[];
  cacheTeams(data);
  return data;
}

export async function createTeam(payload: { name: string; home_field?: string | null }) {
  const res = await authenticatedFetch(`${API_BASE}/admin/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Team>;
}

export async function updateTeam(
  teamId: number,
  payload: { name?: string; home_field?: string | null },
) {
  const res = await authenticatedFetch(`${API_BASE}/admin/teams/${teamId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Team>;
}

export async function deleteTeam(teamId: number, options?: { force?: boolean }) {
  const query = options?.force ? "?force=true" : "";
  await authenticatedFetch(`${API_BASE}/admin/teams/${teamId}${query}`, {
    method: "DELETE",
  });
  return { ok: true };
}

export async function uploadTeamLogo(teamId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authenticatedFetch(`${API_BASE}/admin/teams/${teamId}/logo`, {
    method: "POST",
    body: formData,
  });
  return res.json() as Promise<{ logo_url: string }>;
}

export async function fetchTeamsPublic() {
  const res = await fetch(`${API_BASE}/teams`);
  if (res.ok) {
    const data = (await res.json()) as Team[];
    cacheTeams(data);
    return data;
  }
  if (res.status !== 404) {
    throw new ApiError("Request failed", res.status);
  }

  const fallback = await fetch(`${API_BASE}/admin/teams`);
  if (!fallback.ok) {
    throw new ApiError("Request failed", fallback.status);
  }
  const data = (await fallback.json()) as Team[];
  cacheTeams(data);
  return data;
}

export async function fetchGames() {
  const res = await authenticatedFetch(`${API_BASE}/admin/games`);
  const data = (await res.json()) as Game[];
  cacheGames(data);
  return data;
}

export async function createGame(payload: {
  date: string;
  time?: string | null;
  field?: string | null;
  home_team_id?: number | null;
  away_team_id?: number | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  status?: string;
  home_score?: number | null;
  away_score?: number | null;
}) {
  const res = await authenticatedFetch(`${API_BASE}/admin/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Game>;
}

export async function updateGame(
  gameId: number,
  payload: Partial<{
    date: string;
    time: string | null;
    field: string | null;
    home_team_id: number | null;
    away_team_id: number | null;
    home_team_name: string | null;
    away_team_name: string | null;
    status: string;
    home_score: number | null;
    away_score: number | null;
  }>,
) {
  const res = await authenticatedFetch(`${API_BASE}/admin/games/${gameId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Game>;
}

export async function fetchGameLineup(gameId: number) {
  const res = await authenticatedFetch(`${API_BASE}/admin/games/${gameId}/lineup`);
  return res.json() as Promise<GameLineup>;
}

export async function saveGameLineup(gameId: number, payload: { player_ids: number[] }) {
  const res = await authenticatedFetch(`${API_BASE}/admin/games/${gameId}/lineup`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<GameLineup>;
}

export async function fetchEligibilityReport() {
  const res = await authenticatedFetch(`${API_BASE}/admin/eligibility-report`);
  return res.json() as Promise<EligibilityReportItem[]>;
}

export async function deleteGame(gameId: number) {
  await authenticatedFetch(`${API_BASE}/admin/games/${gameId}`, {
    method: "DELETE",
  });
  return { ok: true };
}

export async function clearGames() {
  await authenticatedFetch(`${API_BASE}/admin/games`, {
    method: "DELETE",
  });
  return { ok: true };
}

export async function fetchGamesPublic() {
  const res = await fetch(`${API_BASE}/games`);
  if (res.ok) {
    const data = (await res.json()) as Game[];
    cacheGames(data);
    return data;
  }
  if (res.status !== 404) {
    throw new ApiError("Request failed", res.status);
  }

  const fallback = await fetch(`${API_BASE}/admin/games`);
  if (!fallback.ok) {
    throw new ApiError("Request failed", fallback.status);
  }
  const data = (await fallback.json()) as Game[];
  cacheGames(data);
  return data;
}

export async function getPosts() {
  const res = await fetch(`${API_BASE}/posts`);
  if (!res.ok) {
    throw new ApiError("Request failed", res.status);
  }
  return res.json() as Promise<Post[]>;
}

export async function createPost(content: string, image?: File | null) {
  const formData = new FormData();
  formData.append("content", content);
  if (image) {
    formData.append("image", image);
  }
  const res = await authenticatedFetch(`${API_BASE}/posts`, {
    method: "POST",
    body: formData,
  });
  return res.json() as Promise<Post>;
}

export async function deletePost(postId: number) {
  await authenticatedFetch(`${API_BASE}/posts/${postId}`, {
    method: "DELETE",
  });
  return { ok: true };
}

export function getCachedTeams(): Team[] | null {
  try {
    const raw = localStorage.getItem(TEAMS_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Team[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function getCachedGames(): Game[] | null {
  try {
    const raw = localStorage.getItem(GAMES_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Game[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function cacheTeams(teams: Team[]) {
  try {
    localStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify(teams));
  } catch {
    // Ignore cache write errors.
  }
}

function cacheGames(games: Game[]) {
  try {
    localStorage.setItem(GAMES_CACHE_KEY, JSON.stringify(games));
  } catch {
    // Ignore cache write errors.
  }
}

export async function fetchRoster(teamId: number) {
  const res = await authenticatedFetch(`${API_BASE}/admin/teams/${teamId}/players`);
  return res.json() as Promise<Player[]>;
}

export async function fetchRosterPublic(teamId: number) {
  const res = await fetch(`${API_BASE}/teams/${teamId}/players`);
  if (res.ok) {
    return res.json() as Promise<Player[]>;
  }
  if (res.status !== 404) {
    throw new ApiError("Request failed", res.status);
  }

  const fallback = await fetch(`${API_BASE}/admin/teams/${teamId}/players`);
  if (!fallback.ok) {
    throw new ApiError("Request failed", fallback.status);
  }
  return fallback.json() as Promise<Player[]>;
}

export async function fetchPlayerAppearanceSummary(playerId: number) {
  const res = await fetch(`${API_BASE}/players/${playerId}/appearance-summary`);
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const data = await res.clone().json();
      if (data && typeof data.detail === "string") {
        detail = data.detail;
      }
    } catch {
      try {
        const text = await res.text();
        if (text) detail = text;
      } catch {
        // ignore
      }
    }
    throw new ApiError(detail || "Request failed", res.status, detail);
  }
  return res.json() as Promise<PlayerAppearanceSummary>;
}

export async function createPlayer(
  teamId: number,
  payload: {
    first_name: string;
    last_name: string;
    number?: number | null;
    position?: string | null;
    bats?: string | null;
    throws?: string | null;
  },
) {
  const res = await authenticatedFetch(`${API_BASE}/admin/teams/${teamId}/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Player>;
}

export async function updatePlayer(
  playerId: number,
  payload: Partial<{
    team_id: number;
    first_name: string;
    last_name: string;
    number: number | null;
    position: string | null;
    bats: string | null;
    throws: string | null;
  }>,
) {
  const res = await authenticatedFetch(`${API_BASE}/admin/players/${playerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Player>;
}

export async function uploadPlayerImage(playerId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authenticatedFetch(`${API_BASE}/admin/players/${playerId}/image`, {
    method: "POST",
    body: formData,
  });
  return res.json() as Promise<{ image_url: string }>;
}

export async function deletePlayer(playerId: number) {
  await authenticatedFetch(`${API_BASE}/admin/players/${playerId}`, {
    method: "DELETE",
  });
  return { ok: true };
}

export type ImportRosterResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export async function importRosterCsv(teamId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authenticatedFetch(`${API_BASE}/teams/${teamId}/roster/import-csv`, {
    method: "POST",
    body: formData,
  });
  return res.json() as Promise<ImportRosterResult>;
}

export type ImportGamesResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export async function importGamesCsv(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authenticatedFetch(`${API_BASE}/games/import-csv`, {
    method: "POST",
    body: formData,
  });
  return res.json() as Promise<ImportGamesResult>;
}
