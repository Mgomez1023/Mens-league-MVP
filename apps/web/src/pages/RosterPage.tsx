import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  uploadTeamLogo,
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
  const { t } = useTranslation();
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
  const [playerDeleteTarget, setPlayerDeleteTarget] = useState<Player | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
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
        setError(t("roster.invalidTeam"));
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
          setError(t("roster.loadError"));
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
        setNotice(t("roster.partialNotice"));
      }

      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [authed, isAdmin, onAuthError, refreshKey, t, teamId, teamNumericId]);

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
  const teamDisplayName = team?.name ?? t("common.teamFallback", { id: teamId ?? "" });

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
      setFormError(t("roster.firstLastRequired"));
      return;
    }

    if (!teamId || Number.isNaN(teamNumericId)) {
      setFormError(t("roster.invalidTeam"));
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
        setNotice(t("roster.playerUpdated"));
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
        setNotice(t("roster.playerAdded"));
      }
      closeModal();
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setFormError(t("auth.adminAccessRequired"));
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setFormError(err.detail);
        return;
      }
      setFormError(t("roster.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlayer = async () => {
    const playerId = playerDeleteTarget?.id;
    if (playerId == null) return;

    setDeletingId(playerId);
    setError(null);
    setNotice(null);
    try {
      await deletePlayer(playerId);
      setPlayers((prev) => prev.filter((player) => player.id !== playerId));
      setNotice(t("roster.playerRemoved"));
      setPlayerDeleteTarget(null);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError(t("auth.adminAccessRequired"));
        return;
      }
      setError(t("roster.deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCsvImport = async (file: File) => {
    if (!file || importing) return;
    if (!teamId || Number.isNaN(teamNumericId)) {
      setError(t("roster.invalidTeam"));
      return;
    }
    setImporting(true);
    setImportResult(null);
    setNotice(null);
    try {
      const result = await importRosterCsv(teamNumericId, file);
      setImportResult(result);
      setRefreshKey((prev) => prev + 1);
      setNotice(t("roster.csvProcessed"));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError(t("auth.adminAccessRequired"));
        return;
      }
      setError(t("roster.importError"));
    } finally {
      setImporting(false);
    }
  };

  const handleTeamLogoUpload = async (file: File | null) => {
    if (!file || uploadingLogo) return;
    if (!file.type.startsWith("image/")) {
      setError(t("roster.invalidImage"));
      return;
    }
    if (!teamId || Number.isNaN(teamNumericId)) {
      setError(t("roster.invalidTeam"));
      return;
    }

    setUploadingLogo(true);
    setError(null);
    setNotice(null);

    try {
      const result = await uploadTeamLogo(teamNumericId, file);
      setTeam((prev) => (prev ? { ...prev, logo_url: result.logo_url } : prev));
      setAllTeams((prev) =>
        prev.map((entry) =>
          entry.id === teamNumericId ? { ...entry, logo_url: result.logo_url } : entry,
        ),
      );
      setNotice(t("roster.logoUpdated"));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError(t("auth.adminAccessRequired"));
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setError(err.detail);
        return;
      }
      setError(t("roster.uploadLogoError"));
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t("roster.eyebrow")}
        title={teamDisplayName}
        description={t("roster.description")}
        actions={
          <div className="inline-actions">
            <Link className="button button-secondary" to="/teams">
              {t("buttons.backToTeams")}
            </Link>
            {isAdmin && (
              <>
                <button className="button button-primary" type="button" onClick={openAddModal}>
                  {t("buttons.addPlayer")}
                </button>
                <label className="button button-secondary file-button-inline">
                  {importing ? `${t("buttons.importCsv")}...` : t("buttons.importCsv")}
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
                <label className="button button-secondary file-button-inline">
                  {uploadingLogo ? `${t("buttons.uploadLogo")}...` : t("buttons.uploadLogo")}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingLogo}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.currentTarget.value = "";
                      void handleTeamLogoUpload(file);
                    }}
                  />
                </label>
              </>
            )}
          </div>
        }
      />

      {loading && <LoadingState label={t("roster.loading")} />}
      {!loading && endpointMissing && (
        <Notice variant="warning">{t("roster.endpointMissing")}</Notice>
      )}
      {!loading && notice && <Notice variant="info">{notice}</Notice>}
      {!loading && error && <Notice variant="error">{error}</Notice>}

      {!loading && !endpointMissing && !error && (
        <>
          <SurfaceCard tone="accent" className="team-summary-card">
            <div className="team-summary-brand">
              <TeamAvatar
                name={teamDisplayName}
                src={team?.logo_url ? resolveApiUrl(team.logo_url) : null}
                size="lg"
              />
              <div>
                <h2>{teamDisplayName}</h2>
                <p>
                </p>
              </div>
            </div>
            <div className="team-summary-side">
              <div className="team-summary-stats">
                <div className="summary-stat">
                  <span>{t("common.record")}</span>
                  <strong>{team ? getRecord(team) : "0-0"}</strong>
                </div>
                <div className="summary-stat">
                  <span>{t("common.players")}</span>
                  <strong>{players.length}</strong>
                </div>
              </div>
            </div>
          </SurfaceCard>

          {isAdmin && importResult && (
            <SurfaceCard>
              <SectionHeader title={t("roster.csvImportResults")} />
              <div className="import-results">
                <p>
                  {t("roster.importSummary", {
                    created: importResult.created,
                    updated: importResult.updated,
                    skipped: importResult.skipped,
                    errors: importResult.errors.length,
                  })}
                </p>
                {importResult.errors.length > 0 && (
                  <ul className="error-list">
                    {importResult.errors.map((item) => (
                      <li key={`${item.row}-${item.message}`}>
                        {t("common.row", { row: item.row })}: {item.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SurfaceCard>
          )}

          <div className="roster-layout">
            <div className="roster-main">
              <SurfaceCard className="roster-table-surface">
                <SectionHeader
                  title={t("roster.activeRoster")}
                  description={t("roster.activeRosterDescription")}
                />
                {players.length === 0 ? (
                  <EmptyState
                    title={t("roster.emptyTitle")}
                    description={t("roster.emptyDescription")}
                  />
                ) : (
                  <div className="table-wrap roster-table-wrap">
                    <table className="league-table roster-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t("common.players")}</th>
                          <th>{t("common.position")}</th>
                          <th>{t("common.bats")}</th>
                          <th>{t("common.throws")}</th>
                          {isAdmin && <th>{t("common.actions")}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((player) => (
                          <tr className="roster-row" key={player.id}>
                            <td className="roster-cell-number" data-label="#">{player.number ?? "-"}</td>
                            <td className="roster-cell-player" data-label={t("common.players")}>
                              <div className="player-name-cell">
                                <strong>
                                  {player.first_name} {player.last_name}
                                </strong>
                              </div>
                            </td>
                            <td className="roster-cell-stat" data-label={t("common.position")}>{player.position ?? "-"}</td>
                            <td className="roster-cell-stat" data-label={t("common.bats")}>{player.bats ?? "-"}</td>
                            <td className="roster-cell-stat" data-label={t("common.throws")}>{player.throws ?? "-"}</td>
                            {isAdmin && (
                              <td className="roster-cell-actions" data-label={t("common.actions")}>
                                <div className="table-actions">
                                  <button
                                    className="button button-secondary button-small"
                                    onClick={() => openEditModal(player)}
                                  >
                                    {t("buttons.edit")}
                                  </button>
                                  <button
                                    className="button button-danger button-small"
                                    onClick={() => setPlayerDeleteTarget(player)}
                                    disabled={deletingId === player.id}
                                  >
                                    {deletingId === player.id ? t("common.deleteInProgress") : t("buttons.delete")}
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
                <SectionHeader title={t("roster.upcomingGames")} />
                {upcomingGames.length === 0 ? (
                  <EmptyState
                    compact
                    title={t("roster.noUpcomingTitle")}
                    description={t("roster.noUpcomingDescription")}
                  />
                ) : (
                  <div className="mini-game-list">
                    {upcomingGames.map((game) => {
                      const isHome = game.home_team_id === teamNumericId;
                      const opponentId = isHome ? game.away_team_id : game.home_team_id;
                      const opponentName = opponentMap[opponentId] ?? t("common.teamFallback", { id: opponentId });
                      return (
                        <div className="mini-game-card" key={game.id}>
                          <div className="mini-game-head">
                            <span>{formatDate(game.date)}</span>
                            <StatusChip tone={getGameStatusMeta(game.status).tone}>
                              {getGameStatusMeta(game.status).label}
                            </StatusChip>
                          </div>
                          <strong>
                            {isHome
                              ? t("roster.vsOpponent", { opponent: opponentName })
                              : t("roster.atOpponent", { opponent: opponentName })}
                          </strong>
                          <p>{formatTime(game.time)} | {game.field || t("common.fieldTbd")}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SurfaceCard>

              <SurfaceCard>
                <SectionHeader title={t("roster.recentResults")} />
                {recentResults.length === 0 ? (
                  <EmptyState
                    compact
                    title={t("roster.noRecentTitle")}
                    description={t("roster.noRecentDescription")}
                  />
                ) : (
                  <div className="mini-game-list">
                    {recentResults.map((game) => {
                      const isHome = game.home_team_id === teamNumericId;
                      const teamScore = isHome ? game.home_score : game.away_score;
                      const opponentScore = isHome ? game.away_score : game.home_score;
                      const opponentId = isHome ? game.away_team_id : game.home_team_id;
                      const opponentName = opponentMap[opponentId] ?? t("common.teamFallback", { id: opponentId });
                      return (
                        <div className="mini-game-card" key={game.id}>
                          <div className="mini-game-head">
                            <span>{formatDate(game.date)}</span>
                            <StatusChip tone="success">{t("games.status.final")}</StatusChip>
                          </div>
                          <strong>
                            {isHome
                              ? t("roster.vsOpponent", { opponent: opponentName })
                              : t("roster.atOpponent", { opponent: opponentName })}
                          </strong>
                          <p>{teamScore ?? "-"} - {opponentScore ?? "-"} | {game.field || t("common.fieldTbd")}</p>
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
              title={editingPlayer ? t("roster.modal.editTitle") : t("roster.modal.addTitle")}
              action={
                <button className="button button-secondary button-small" type="button" onClick={closeModal}>
                  {t("buttons.close")}
                </button>
              }
            />
            <form className="form-grid" onSubmit={handleSavePlayer}>
              <label className="field">
                <span>{t("roster.modal.firstName")}</span>
                <input
                  value={formData.first_name}
                  onChange={(event) => handleFormChange("first_name", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("roster.modal.lastName")}</span>
                <input
                  value={formData.last_name}
                  onChange={(event) => handleFormChange("last_name", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("roster.modal.number")}</span>
                <input
                  type="number"
                  min="0"
                  value={formData.number}
                  onChange={(event) => handleFormChange("number", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.position")}</span>
                <input
                  value={formData.position}
                  onChange={(event) => handleFormChange("position", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.bats")}</span>
                <select
                  value={formData.bats}
                  onChange={(event) => handleFormChange("bats", event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  <option value="R">R</option>
                  <option value="L">L</option>
                  <option value="S">S</option>
                </select>
              </label>
              <label className="field">
                <span>{t("common.throws")}</span>
                <select
                  value={formData.throws}
                  onChange={(event) => handleFormChange("throws", event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  <option value="R">R</option>
                  <option value="L">L</option>
                </select>
              </label>
              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? t("common.saveInProgress") : t("roster.modal.savePlayer")}
                </button>
                <button className="button button-secondary" type="button" onClick={closeModal}>
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>
            {formError && <Notice variant="error">{formError}</Notice>}
          </SurfaceCard>
        </div>
      )}

      {isAdmin && playerDeleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <SurfaceCard className="modal-card">
            <SectionHeader
              title={t("roster.deleteTitle")}
              description={t("roster.deleteDescription")}
            />
            <p className="confirmation-copy">
              <strong>
                {playerDeleteTarget.first_name} {playerDeleteTarget.last_name}
              </strong>
              <span>{t("roster.deleteConfirm")}</span>
            </p>
            <div className="form-actions">
              <button
                className="button button-danger"
                type="button"
                onClick={() => void handleDeletePlayer()}
                disabled={deletingId === playerDeleteTarget.id}
              >
                {deletingId === playerDeleteTarget.id ? t("common.deleteInProgress") : t("buttons.delete")}
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setPlayerDeleteTarget(null)}
                disabled={deletingId === playerDeleteTarget.id}
              >
                {t("buttons.cancel")}
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}
    </section>
  );
}
