import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  AuthError,
  createGame,
  deleteGame,
  updateGame,
  fetchGames,
  fetchGamesPublic,
  fetchTeams,
  fetchTeamsPublic,
  importGamesCsv,
  clearGames,
  getCachedGames,
  getCachedTeams,
  resolveApiUrl,
  PermissionError,
} from "../api";
import type { Game, Team, ImportGamesResult } from "../api";

type GamesPageProps = {
  authed: boolean;
  isAdmin: boolean;
  onAuthError: () => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(value?: string | null) {
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

function parseDateOnly(value: string) {
  if (!value) return null;
  const datePart = value.includes("T") ? value.split("T")[0] : value.split(" ")[0];
  const date = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getWeekLabel(value: string) {
  const date = parseDateOnly(value);
  if (!date) return "Unscheduled";
  const seasonStart = new Date("2026-04-19T00:00:00");
  const seasonEnd = new Date("2026-10-25T23:59:59");
  if (date < seasonStart || date > seasonEnd) return "Out of Season";
  const diffMs = date.getTime() - seasonStart.getTime();
  const weekIndex = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return `Week ${weekIndex + 1}`;
}

export default function GamesPage({ authed, isAdmin, onAuthError }: GamesPageProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportGamesResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [formData, setFormData] = useState({
    date: "",
    time: "",
    field: "",
    home_team_id: "",
    away_team_id: "",
    status: "SCHEDULED",
    home_score: "",
    away_score: "",
  });
  const [editData, setEditData] = useState({
    date: "",
    time: "",
    field: "",
    status: "SCHEDULED",
    home_score: "",
    away_score: "",
  });

  const formatDateInput = (value: string) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
    return parsed.toISOString().slice(0, 10);
  };

  const teamMap = useMemo(() => {
    const map: Record<number, Team> = {};
    teams.forEach((team) => {
      map[team.id] = team;
    });
    return map;
  }, [teams]);

  const groupedGames = useMemo(() => {
    if (games.length === 0) return [];
    const sorted = [...games].sort((a, b) => {
      const dateA = parseDateOnly(a.date);
      const dateB = parseDateOnly(b.date);
      if (!dateA && !dateB) return a.id - b.id;
      if (!dateA) return 1;
      if (!dateB) return -1;
      const diff = dateA.getTime() - dateB.getTime();
      return diff !== 0 ? diff : a.id - b.id;
    });
    const sections: { label: string; games: Game[] }[] = [];
    sorted.forEach((game) => {
      const label = getWeekLabel(game.date);
      const last = sections[sections.length - 1];
      if (!last || last.label !== label) {
        sections.push({ label, games: [game] });
      } else {
        last.games.push(game);
      }
    });
    return sections;
  }, [games]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      setEndpointMissing(false);

      const canAdmin = authed && isAdmin;
      const [teamsResult, gamesResult] = await Promise.allSettled([
        canAdmin ? fetchTeams() : fetchTeamsPublic(),
        canAdmin ? fetchGames() : fetchGamesPublic(),
      ]);

      if (!active) return;

      const authError = [teamsResult, gamesResult].find(
        (result) => result.status === "rejected" && result.reason instanceof AuthError,
      );

      if (authError && canAdmin) {
        onAuthError();
        return;
      }

      if (teamsResult.status === "fulfilled") {
        setTeams(teamsResult.value);
      } else if (
        teamsResult.status === "rejected" &&
        teamsResult.reason instanceof ApiError &&
        (teamsResult.reason.status === 401 || teamsResult.reason.status === 403) &&
        !canAdmin
      ) {
        const cached = getCachedTeams();
        if (cached && cached.length > 0) {
          setTeams(cached);
          setNotice("Showing cached games. Log in for the latest data.");
        } else {
          setError("Teams data is temporarily unavailable.");
        }
      } else {
        setError("Some data could not be loaded.");
      }

      if (gamesResult.status === "fulfilled") {
        setGames(gamesResult.value);
      } else if (
        gamesResult.status === "rejected" &&
        gamesResult.reason instanceof ApiError &&
        (gamesResult.reason.status === 401 || gamesResult.reason.status === 403) &&
        !canAdmin
      ) {
        const cached = getCachedGames();
        if (cached && cached.length > 0) {
          setGames(cached);
          setNotice("Showing cached games. Log in for the latest data.");
        } else {
          setError("Games are temporarily unavailable without login.");
        }
      } else if (
        gamesResult.status === "rejected" &&
        gamesResult.reason instanceof ApiError &&
        gamesResult.reason.status === 404
      ) {
        const cached = getCachedGames();
        if (cached && cached.length > 0) {
          setGames(cached);
          setNotice("Showing cached games. Log in for the latest data.");
        } else {
          setEndpointMissing(true);
        }
      } else {
        setError("Unable to load games right now.");
      }

      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [authed, isAdmin, onAuthError]);

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateGame = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!formData.date || !formData.home_team_id || !formData.away_team_id) {
      setFormError("Date, home team, and away team are required.");
      return;
    }

    if (formData.home_team_id === formData.away_team_id) {
      setFormError("Home and away teams must be different.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: formData.date,
        time: formData.time || null,
        field: formData.field || null,
        home_team_id: Number(formData.home_team_id),
        away_team_id: Number(formData.away_team_id),
        status: formData.status || "SCHEDULED",
        home_score: formData.home_score ? Number(formData.home_score) : null,
        away_score: formData.away_score ? Number(formData.away_score) : null,
      };
      const created = await createGame(payload);
      setGames((prev) =>
        [...prev, created].sort((a, b) => a.date.localeCompare(b.date)),
      );
      setFormData({
        date: "",
        time: "",
        field: "",
        home_team_id: "",
        away_team_id: "",
        status: "SCHEDULED",
        home_score: "",
        away_score: "",
      });
      setFormOpen(false);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setFormError("Admin access required.");
        return;
      }
      setFormError("Unable to add game right now.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditStart = (game: Game) => {
    setEditError(null);
    setEditingGame(game);
    setEditData({
      date: formatDateInput(game.date),
      time: game.time ?? "",
      field: game.field ?? "",
      status: game.status ?? "SCHEDULED",
      home_score: game.home_score != null ? String(game.home_score) : "",
      away_score: game.away_score != null ? String(game.away_score) : "",
    });
  };

  const handleEditChange = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingGame) return;
    setEditError(null);
    setEditSaving(true);
    try {
      const payload = {
        date: editData.date || undefined,
        time: editData.time || null,
        field: editData.field || null,
        status: editData.status || undefined,
        home_score: editData.home_score === "" ? null : Number(editData.home_score),
        away_score: editData.away_score === "" ? null : Number(editData.away_score),
      };
      const updated = await updateGame(editingGame.id, payload);
      setGames((prev) =>
        prev.map((game) => (game.id === updated.id ? updated : game)),
      );
      setEditingGame(null);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setEditError("Admin access required.");
        return;
      }
      setEditError("Unable to update game right now.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditingGame(null);
    setEditError(null);
  };

  const handleDeleteGame = async (gameId: number) => {
    if (!window.confirm("Delete this game?")) return;
    setDeletingId(gameId);
    try {
      await deleteGame(gameId);
      setGames((prev) => prev.filter((game) => game.id !== gameId));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError("Admin access required.");
        return;
      }
      setError("Unable to delete game right now.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearGames = async () => {
    const confirmed = window.confirm("This will delete all games. Are you sure?");
    if (!confirmed) return;
    setDeletingId(-1);
    setError(null);
    try {
      await clearGames();
      setGames([]);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError("Admin access required.");
        return;
      }
      setError("Unable to clear games right now.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleImportGames = async (file: File) => {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await importGamesCsv(file);
      setImportResult(result);
      setFileInputKey((prev) => prev + 1);
      const [freshGames, freshTeams] = await Promise.all([fetchGames(), fetchTeams()]);
      setGames(freshGames);
      setTeams(freshTeams);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setImportError("Admin access required.");
        return;
      }
      setImportError("Unable to import games.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Games</h1>
          <p className="muted">
            {isAdmin
              ? "Review upcoming and completed matchups."
              : "Browse the schedule in read-only mode."}
          </p>
          {isAdmin && (
            <div className="header-actions">
              <button
                className="ghost-link"
                type="button"
                onClick={() => setFormOpen((prev) => !prev)}
              >
                {formOpen ? "Close" : "Add game"}
              </button>
              <label className="ghost-link import-label">
                {importing ? "Importing..." : "Import Games CSV"}
                <input
                  key={fileInputKey}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={importing}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleImportGames(file);
                  }}
                />
              </label>
              <button
                className="danger-button"
                type="button"
                onClick={handleClearGames}
                disabled={deletingId === -1}
              >
                {deletingId === -1 ? "Clearing..." : "Clear games"}
              </button>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="table-card roster-import">
          {importError && <p className="status error">{importError}</p>}
          {importResult && (
            <div className="import-summary">
              <p className="status">
                Created {importResult.created}, Updated {importResult.updated}, Skipped{" "}
                {importResult.skipped}, Errors {importResult.errors.length}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="error-list">
                  {importResult.errors.map((error) => (
                    <li key={`${error.row}-${error.message}`}>
                      Row {error.row}: {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && formOpen && (
        <div className="table-card form-card">
          <form className="form-grid" onSubmit={handleCreateGame}>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={formData.date}
                onChange={(event) => handleFormChange("date", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Time</span>
              <input
                type="time"
                value={formData.time}
                onChange={(event) => handleFormChange("time", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Field</span>
              <input
                value={formData.field}
                onChange={(event) => handleFormChange("field", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="field">
              <span>Home Team</span>
              <select
                value={formData.home_team_id}
                onChange={(event) => handleFormChange("home_team_id", event.target.value)}
              >
                <option value="">Select</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Away Team</span>
              <select
                value={formData.away_team_id}
                onChange={(event) => handleFormChange("away_team_id", event.target.value)}
              >
                <option value="">Select</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={formData.status}
                onChange={(event) => handleFormChange("status", event.target.value)}
              >
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="FINAL">Final</option>
              </select>
            </label>
            <label className="field">
              <span>Home Score</span>
              <input
                type="number"
                min="0"
                value={formData.home_score}
                onChange={(event) => handleFormChange("home_score", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="field">
              <span>Away Score</span>
              <input
                type="number"
                min="0"
                value={formData.away_score}
                onChange={(event) => handleFormChange("away_score", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <div className="form-actions form-actions-split">
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save game"}
              </button>
            </div>
          </form>
          {formError && <p className="status error">{formError}</p>}
        </div>
      )}

      {isAdmin && editingGame && (
        <div className="table-card form-card">
          <form className="form-grid" onSubmit={handleEditSave}>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={editData.date}
                onChange={(event) => handleEditChange("date", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Time</span>
              <input
                type="time"
                value={editData.time}
                onChange={(event) => handleEditChange("time", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Field</span>
              <input
                value={editData.field}
                onChange={(event) => handleEditChange("field", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={editData.status}
                onChange={(event) => handleEditChange("status", event.target.value)}
              >
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="FINAL">Final</option>
              </select>
            </label>
            <label className="field">
              <span>Home Score</span>
              <input
                type="number"
                min="0"
                value={editData.home_score}
                onChange={(event) => handleEditChange("home_score", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="field">
              <span>Away Score</span>
              <input
                type="number"
                min="0"
                value={editData.away_score}
                onChange={(event) => handleEditChange("away_score", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <div className="form-actions form-actions-split">
              <button type="submit" className="primary-button" disabled={editSaving}>
                {editSaving ? "Saving..." : "Save changes"}
              </button>
              <button type="button" className="ghost-link" onClick={handleEditCancel}>
                Cancel
              </button>
            </div>
          </form>
          {editError && <p className="status error">{editError}</p>}
        </div>
      )}

      {loading && <p className="status">Loading games...</p>}
      {!loading && endpointMissing && (
        <p className="status">Games endpoint not available yet.</p>
      )}
      {!loading && notice && <p className="status">{notice}</p>}
      {!loading && error && <p className="status error">{error}</p>}

      {!loading && !endpointMissing && !error && (
        <>
          {groupedGames.map((section) => (
            <div className="week-section" key={section.label}>
              <h2 className="week-title">{section.label}</h2>
              <div className="games-grid">
                {section.games.map((game) => {
                  const home =
                    teamMap[game.home_team_id]?.name ?? `Team ${game.home_team_id}`;
                  const away =
                    teamMap[game.away_team_id]?.name ?? `Team ${game.away_team_id}`;
                  const homeLogo = teamMap[game.home_team_id]?.logo_url;
                  const awayLogo = teamMap[game.away_team_id]?.logo_url;
                  const homeInitial = home.charAt(0).toUpperCase();
                  const awayInitial = away.charAt(0).toUpperCase();
                  const score =
                    game.home_score != null && game.away_score != null
                      ? `${game.away_score} - ${game.home_score}`
                      : "Score TBD";
                  const statusClass = game.status.toLowerCase().replace(/\s+/g, "_");
                  return (
                    <div className="game-card" key={game.id}>
                      <div className="game-meta">
                        <div className="game-datetime">
                          <span className="game-date">{formatDate(game.date)}</span>
                          <span className="game-time">{formatTime(game.time)}</span>
                        </div>
                        <span className="game-field">
                          {game.field ? game.field : "Location TBD"}
                        </span>
                        <span className={`status-pill ${statusClass}`}>{game.status}</span>
                      </div>
                      <div className="game-matchup">
                        <div className="game-team">
                          {awayLogo ? (
                            <img src={resolveApiUrl(awayLogo)} alt={`${away} logo`} />
                          ) : (
                            <div className="game-team-fallback" aria-hidden="true">
                              {awayInitial || "T"}
                            </div>
                          )}
                          <span className="game-team-name">{away}</span>
                          <span className="game-team-record">
                            {teamMap[game.away_team_id]?.wins ?? 0}-
                            {teamMap[game.away_team_id]?.losses ?? 0}
                          </span>
                        </div>
                        <div className="game-vs">VS</div>
                        <div className="game-team">
                          {homeLogo ? (
                            <img src={resolveApiUrl(homeLogo)} alt={`${home} logo`} />
                          ) : (
                            <div className="game-team-fallback" aria-hidden="true">
                              {homeInitial || "T"}
                            </div>
                          )}
                          <span className="game-team-name">{home}</span>
                          <span className="game-team-record">
                            {teamMap[game.home_team_id]?.wins ?? 0}-
                            {teamMap[game.home_team_id]?.losses ?? 0}
                          </span>
                        </div>
                      </div>
                      <div className="game-score">{score}</div>
                      {isAdmin && (
                        <div className="game-actions">
                          <button
                            className="link-button"
                            onClick={() => handleEditStart(game)}
                          >
                            Edit
                          </button>
                          <button
                            className="danger-button"
                            onClick={() => handleDeleteGame(game.id)}
                            disabled={deletingId === game.id}
                          >
                            {deletingId === game.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {games.length === 0 && (
            <p className="status">No games scheduled yet.</p>
          )}
        </>
      )}
    </section>
  );
}
