import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  AuthError,
  PermissionError,
  createPlayer,
  deletePlayer,
  fetchGames,
  fetchGamesPublic,
  fetchRoster,
  fetchRosterPublic,
  fetchTeams,
  fetchTeamsPublic,
  importRosterCsv,
  resolveApiUrl,
  updatePlayer,
} from "../api";
import type { Game, Player, Team } from "../api";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  SectionHeader,
  StatusChip,
  SurfaceCard,
  TeamAvatar,
} from "../components/ui";
import {
  formatDate,
  formatTime,
  getGameStatusMeta,
  getRecentResults,
  getRecord,
  getUpcomingGames,
} from "../utils/league";

type RosterPageProps = {
  authed: boolean;
  isAdmin: boolean;
  onAuthError: () => void;
};

const emptyForm = {
  first_name: "",
  last_name: "",
  number: "",
  position: "",
  bats: "",
  throws: "",
};

export default function RosterPage({ authed, isAdmin, onAuthError }: RosterPageProps) {
  const { teamId } = useParams();
  const teamNumericId = Number(teamId);
  const [team, setTeam] = useState<Team | null>(null);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setEndpointMissing(false);
      setNotice(null);

      if (!teamId || Number.isNaN(teamNumericId)) {
        setError("Invalid team selection.");
        setLoading(false);
        return;
      }

      const canAdmin = authed && isAdmin;
      const [rosterRes, teamsRes, gamesRes] = await Promise.allSettled([
        canAdmin ? fetchRoster(teamNumericId) : fetchRosterPublic(teamNumericId),
        canAdmin ? fetchTeams() : fetchTeamsPublic(),
        canAdmin ? fetchGames() : fetchGamesPublic(),
      ]);

      if (!active) return;

      if (rosterRes.status === "rejected") {
        if (rosterRes.reason instanceof AuthError && canAdmin) {
          onAuthError();
          return;
        }
        if (rosterRes.reason instanceof ApiError && rosterRes.reason.status === 404) {
          setEndpointMissing(true);
        } else {
          setError("Unable to load roster right now.");
        }
        setLoading(false);
        return;
      }

      setPlayers(
        [...rosterRes.value].sort((a, b) => {
          const numberA = a.number ?? Number.MAX_SAFE_INTEGER;
          const numberB = b.number ?? Number.MAX_SAFE_INTEGER;
          if (numberA !== numberB) return numberA - numberB;
          return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
        }),
      );

      if (teamsRes.status === "fulfilled") {
        setAllTeams(teamsRes.value);
        setTeam(teamsRes.value.find((entry) => entry.id === teamNumericId) ?? null);
      }

      if (gamesRes.status === "fulfilled") {
        setGames(
          gamesRes.value.filter(
            (game) =>
              game.home_team_id === teamNumericId || game.away_team_id === teamNumericId,
          ),
        );
      }

      if (teamsRes.status === "rejected" || gamesRes.status === "rejected") {
        setNotice("Roster loaded. Some team summary details may be incomplete right now.");
      }

      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [authed, isAdmin, onAuthError, refreshKey, teamId, teamNumericId]);

  const opponentMap = useMemo(
    () =>
      allTeams.reduce<Record<number, string>>((acc, entry) => {
        acc[entry.id] = entry.name;
        return acc;
      }, {}),
    [allTeams],
  );
  const upcomingGames = useMemo(() => getUpcomingGames(games).slice(0, 3), [games]);
  const recentResults = useMemo(() => getRecentResults(games).slice(0, 3), [games]);

  const openAddModal = () => {
    setEditingPlayer(null);
    setFormData(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (player: Player) => {
    setEditingPlayer(player);
    setFormData({
      first_name: player.first_name ?? "",
      last_name: player.last_name ?? "",
      number: player.number != null ? String(player.number) : "",
      position: player.position ?? "",
      bats: player.bats ?? "",
      throws: player.throws ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPlayer(null);
    setFormError(null);
  };

  const handleFormChange = (field: keyof typeof emptyForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSavePlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setFormError("First and last name are required.");
      return;
    }

    if (!teamId || Number.isNaN(teamNumericId)) {
      setFormError("Invalid team selection.");
      return;
    }

    const payload = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      number: formData.number ? Number(formData.number) : null,
      position: formData.position.trim() || null,
      bats: formData.bats.trim() || null,
      throws: formData.throws.trim() || null,
    };

    setSaving(true);
    try {
      if (editingPlayer) {
        const updated = await updatePlayer(editingPlayer.id, payload);
        setPlayers((prev) =>
          [...prev.filter((player) => player.id !== updated.id), updated].sort((a, b) => {
            const numberA = a.number ?? Number.MAX_SAFE_INTEGER;
            const numberB = b.number ?? Number.MAX_SAFE_INTEGER;
            if (numberA !== numberB) return numberA - numberB;
            return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
          }),
        );
        setNotice("Player updated.");
      } else {
        const created = await createPlayer(teamNumericId, payload);
        setPlayers((prev) =>
          [...prev, created].sort((a, b) => {
            const numberA = a.number ?? Number.MAX_SAFE_INTEGER;
            const numberB = b.number ?? Number.MAX_SAFE_INTEGER;
            if (numberA !== numberB) return numberA - numberB;
            return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
          }),
        );
        setNotice("Player added.");
      }
      closeModal();
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setFormError("Admin access required.");
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setFormError(err.detail);
        return;
      }
      setFormError("Unable to save player right now.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlayer = async (playerId: number) => {
    if (!window.confirm("Delete this player?")) return;
    setDeletingId(playerId);
    setError(null);
    setNotice(null);
    try {
      await deletePlayer(playerId);
      setPlayers((prev) => prev.filter((player) => player.id !== playerId));
      setNotice("Player removed.");
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError("Admin access required.");
        return;
      }
      setError("Unable to delete player right now.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCsvImport = async (file: File) => {
    if (!file || importing) return;
    if (!teamId || Number.isNaN(teamNumericId)) {
      setError("Invalid team selection.");
      return;
    }
    setImporting(true);
    setImportResult(null);
    setNotice(null);
    try {
      const result = await importRosterCsv(teamNumericId, file);
      setImportResult(result);
      setRefreshKey((prev) => prev + 1);
      setNotice("Roster CSV processed.");
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError("Admin access required.");
        return;
      }
      setError("Unable to import roster.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Team roster"
        title={team?.name ?? `Team ${teamId ?? ""}`}
        description="Team lineup, player list, and nearby schedule context."
        actions={
          <div className="inline-actions">
            <Link className="button button-secondary" to="/teams">
              Back to teams
            </Link>
            {isAdmin && (
              <>
                <button className="button button-primary" type="button" onClick={openAddModal}>
                  Add player
                </button>
                <label className="button button-secondary file-button-inline">
                  {importing ? "Importing..." : "Import CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={importing}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file) handleCsvImport(file);
                    }}
                  />
                </label>
              </>
            )}
          </div>
        }
      />

      {loading && <LoadingState label="Loading roster..." />}
      {!loading && endpointMissing && (
        <Notice variant="warning">Roster endpoint not available yet.</Notice>
      )}
      {!loading && notice && <Notice variant="info">{notice}</Notice>}
      {!loading && error && <Notice variant="error">{error}</Notice>}

      {!loading && !endpointMissing && !error && (
        <>
          <SurfaceCard tone="accent" className="team-summary-card">
            <div className="team-summary-brand">
              <TeamAvatar
                name={team?.name ?? `Team ${teamId ?? ""}`}
                src={team?.logo_url ? resolveApiUrl(team.logo_url) : null}
                size="lg"
              />
              <div>
                <p className="hero-kicker">Team profile</p>
                <h2>{team?.name ?? `Team ${teamId ?? ""}`}</h2>
                <p>
                  {team?.home_field ? `Home field: ${team.home_field}` : "Home field not listed"}
                </p>
              </div>
            </div>
            <div className="team-summary-stats">
              <div className="summary-stat">
                <span>Record</span>
                <strong>{team ? getRecord(team) : "0-0"}</strong>
              </div>
              <div className="summary-stat">
                <span>Players</span>
                <strong>{players.length}</strong>
              </div>
            </div>
          </SurfaceCard>

          {isAdmin && importResult && (
            <SurfaceCard>
              <SectionHeader title="CSV import results" />
              <div className="import-results">
                <p>
                  Created {importResult.created}, Updated {importResult.updated}, Skipped{" "}
                  {importResult.skipped}, Errors {importResult.errors.length}
                </p>
                {importResult.errors.length > 0 && (
                  <ul className="error-list">
                    {importResult.errors.map((item) => (
                      <li key={`${item.row}-${item.message}`}>
                        Row {item.row}: {item.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SurfaceCard>
          )}

          <div className="roster-layout">
            <div className="roster-main">
              <SurfaceCard>
                <SectionHeader
                  title="Active roster"
                  description="Player list for the selected team."
                />
                {players.length === 0 ? (
                  <EmptyState
                    title="No players listed"
                    description="Add players manually or import a roster CSV to populate this team."
                  />
                ) : (
                  <div className="table-wrap">
                    <table className="league-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Player</th>
                          <th>Position</th>
                          <th>Bats</th>
                          <th>Throws</th>
                          {isAdmin && <th>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((player) => (
                          <tr key={player.id}>
                            <td data-label="#">{player.number ?? "-"}</td>
                            <td data-label="Player">
                              <div className="player-name-cell">
                                <strong>
                                  {player.first_name} {player.last_name}
                                </strong>
                              </div>
                            </td>
                            <td data-label="Position">{player.position ?? "-"}</td>
                            <td data-label="Bats">{player.bats ?? "-"}</td>
                            <td data-label="Throws">{player.throws ?? "-"}</td>
                            {isAdmin && (
                              <td data-label="Actions">
                                <div className="table-actions">
                                  <button
                                    className="button button-secondary button-small"
                                    onClick={() => openEditModal(player)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="button button-danger button-small"
                                    onClick={() => handleDeletePlayer(player.id)}
                                    disabled={deletingId === player.id}
                                  >
                                    {deletingId === player.id ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SurfaceCard>
            </div>

            <div className="roster-side">
              <SurfaceCard>
                <SectionHeader title="Upcoming games" />
                {upcomingGames.length === 0 ? (
                  <EmptyState
                    compact
                    title="No upcoming games"
                    description="Future matchups for this team will appear here."
                  />
                ) : (
                  <div className="mini-game-list">
                    {upcomingGames.map((game) => {
                      const isHome = game.home_team_id === teamNumericId;
                      const opponentId = isHome ? game.away_team_id : game.home_team_id;
                      const opponentName = opponentMap[opponentId] ?? `Team ${opponentId}`;
                      return (
                        <div className="mini-game-card" key={game.id}>
                          <div className="mini-game-head">
                            <span>{formatDate(game.date)}</span>
                            <StatusChip tone={getGameStatusMeta(game.status).tone}>
                              {getGameStatusMeta(game.status).label}
                            </StatusChip>
                          </div>
                          <strong>{isHome ? "vs" : "at"} {opponentName}</strong>
                          <p>{formatTime(game.time)} | {game.field || "Field TBD"}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SurfaceCard>

              <SurfaceCard>
                <SectionHeader title="Recent results" />
                {recentResults.length === 0 ? (
                  <EmptyState
                    compact
                    title="No recent finals"
                    description="Completed results involving this team will appear here."
                  />
                ) : (
                  <div className="mini-game-list">
                    {recentResults.map((game) => {
                      const isHome = game.home_team_id === teamNumericId;
                      const teamScore = isHome ? game.home_score : game.away_score;
                      const opponentScore = isHome ? game.away_score : game.home_score;
                      const opponentId = isHome ? game.away_team_id : game.home_team_id;
                      const opponentName = opponentMap[opponentId] ?? `Team ${opponentId}`;
                      return (
                        <div className="mini-game-card" key={game.id}>
                          <div className="mini-game-head">
                            <span>{formatDate(game.date)}</span>
                            <StatusChip tone="success">Final</StatusChip>
                          </div>
                          <strong>{isHome ? "vs" : "at"} {opponentName}</strong>
                          <p>{teamScore ?? "-"} - {opponentScore ?? "-"} | {game.field || "Field TBD"}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SurfaceCard>
            </div>
          </div>
        </>
      )}

      {isAdmin && modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <SurfaceCard className="modal-card">
            <SectionHeader
              title={editingPlayer ? "Edit player" : "Add player"}
              action={
                <button className="button button-secondary button-small" type="button" onClick={closeModal}>
                  Close
                </button>
              }
            />
            <form className="form-grid" onSubmit={handleSavePlayer}>
              <label className="field">
                <span>First name</span>
                <input
                  value={formData.first_name}
                  onChange={(event) => handleFormChange("first_name", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Last name</span>
                <input
                  value={formData.last_name}
                  onChange={(event) => handleFormChange("last_name", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Number</span>
                <input
                  type="number"
                  min="0"
                  value={formData.number}
                  onChange={(event) => handleFormChange("number", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Position</span>
                <input
                  value={formData.position}
                  onChange={(event) => handleFormChange("position", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Bats</span>
                <select
                  value={formData.bats}
                  onChange={(event) => handleFormChange("bats", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="R">R</option>
                  <option value="L">L</option>
                  <option value="S">S</option>
                </select>
              </label>
              <label className="field">
                <span>Throws</span>
                <select
                  value={formData.throws}
                  onChange={(event) => handleFormChange("throws", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="R">R</option>
                  <option value="L">L</option>
                </select>
              </label>
              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save player"}
                </button>
                <button className="button button-secondary" type="button" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>
            {formError && <Notice variant="error">{formError}</Notice>}
          </SurfaceCard>
        </div>
      )}
    </section>
  );
}
