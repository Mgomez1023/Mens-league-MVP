import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  AuthError,
  PermissionError,
  createPlayer,
  deletePlayer,
  fetchPlayerAppearanceSummary,
  fetchGames,
  fetchGamesPublic,
  fetchRoster,
  fetchRosterPublic,
  fetchTeams,
  fetchTeamsPublic,
  importRosterCsv,
  resolveApiUrl,
  uploadPlayerImage,
  uploadTeamLogo,
  updatePlayer,
} from "../api";
import type { Game, Player, PlayerAppearanceSummary, Team } from "../api";
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
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
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

function getPlayerInitials(firstName?: string | null, lastName?: string | null) {
  const firstInitial = firstName?.trim().charAt(0) ?? "";
  const lastInitial = lastName?.trim().charAt(0) ?? "";
  const initials = `${firstInitial}${lastInitial}`.trim().toUpperCase();
  return initials || "P";
}

function PlayerPhoto({
  firstName,
  lastName,
  src,
  alt,
  className = "",
}: {
  firstName?: string | null;
  lastName?: string | null;
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const classes = ["player-photo-frame", className, src ? "" : "player-photo-frame-placeholder"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <span aria-hidden="true">{getPlayerInitials(firstName, lastName)}</span>
      )}
    </div>
  );
}

function sortRosterPlayers(players: Player[]) {
  return [...players].sort((a, b) => {
    const numberA = a.number ?? Number.MAX_SAFE_INTEGER;
    const numberB = b.number ?? Number.MAX_SAFE_INTEGER;
    if (numberA !== numberB) return numberA - numberB;
    return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
  });
}

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
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [playerSummary, setPlayerSummary] = useState<PlayerAppearanceSummary | null>(null);
  const [playerSummaryLoading, setPlayerSummaryLoading] = useState(false);
  const [playerSummaryError, setPlayerSummaryError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useBodyScrollLock(modalOpen || !!playerDeleteTarget || !!selectedPlayer);

  useEffect(
    () => () => {
      if (formImagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(formImagePreview);
      }
    },
    [formImagePreview],
  );

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

      setPlayers(sortRosterPlayers(rosterRes.value));

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

  useEffect(() => {
    if (!selectedPlayer) {
      setPlayerSummary(null);
      setPlayerSummaryError(null);
      setPlayerSummaryLoading(false);
      return;
    }

    let active = true;
    setPlayerSummaryLoading(true);
    setPlayerSummaryError(null);
    setPlayerSummary(null);

    void fetchPlayerAppearanceSummary(selectedPlayer.id)
      .then((summary) => {
        if (!active) return;
        setPlayerSummary(summary);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.detail) {
          setPlayerSummaryError(err.detail);
          return;
        }
        setPlayerSummaryError(t("roster.playerDetailLoadError"));
      })
      .finally(() => {
        if (active) {
          setPlayerSummaryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedPlayer, t]);

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

  const updateFormImagePreview = (nextUrl: string | null) => {
    setFormImagePreview((prev) => {
      if (prev && prev !== nextUrl && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return nextUrl;
    });
  };

  const openAddModal = () => {
    setEditingPlayer(null);
    setFormData(emptyForm);
    setFormImageFile(null);
    updateFormImagePreview(null);
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
    setFormImageFile(null);
    updateFormImagePreview(player.image_url ? resolveApiUrl(player.image_url) : null);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPlayer(null);
    setFormImageFile(null);
    updateFormImagePreview(null);
    setFormError(null);
  };

  const openPlayerDetails = (player: Player) => {
    setSelectedPlayer(player);
  };

  const closePlayerDetails = () => {
    setSelectedPlayer(null);
  };

  const openEditFromDetails = () => {
    if (!selectedPlayer) return;
    const player = selectedPlayer;
    closePlayerDetails();
    openEditModal(player);
  };

  const handleFormChange = (field: keyof typeof emptyForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormImageChange = (file: File | null) => {
    if (!file) {
      setFormImageFile(null);
      updateFormImagePreview(editingPlayer?.image_url ? resolveApiUrl(editingPlayer.image_url) : null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setFormError(t("roster.invalidImage"));
      return;
    }
    setFormError(null);
    setFormImageFile(file);
    updateFormImagePreview(URL.createObjectURL(file));
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
      let savedPlayer: Player;
      if (editingPlayer) {
        const updated = await updatePlayer(editingPlayer.id, payload);
        savedPlayer = updated;
      } else {
        const created = await createPlayer(teamNumericId, payload);
        savedPlayer = created;
      }

      let saveNotice = editingPlayer ? t("roster.playerUpdated") : t("roster.playerAdded");
      if (formImageFile) {
        try {
          const imageResult = await uploadPlayerImage(savedPlayer.id, formImageFile);
          savedPlayer = { ...savedPlayer, image_url: imageResult.image_url };
        } catch (err) {
          if (err instanceof AuthError) {
            onAuthError();
            return;
          }
          if (err instanceof PermissionError) {
            setFormError(t("auth.adminAccessRequired"));
            return;
          }
          saveNotice = t("roster.playerImageUploadError");
        }
      }

      setPlayers((prev) =>
        sortRosterPlayers([...prev.filter((player) => player.id !== savedPlayer.id), savedPlayer]),
      );
      setSelectedPlayer((prev) => (prev?.id === savedPlayer.id ? savedPlayer : prev));
      setNotice(saveNotice);
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
      if (editingPlayer?.id === playerId) {
        closeModal();
      }
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
        description={t("")}
        titleAction={
          <Link className="button button-secondary button-small page-title-action-compact" to="/teams">
            {t("buttons.backToTeams")}
          </Link>
        }
        actions={
          <div className="inline-actions roster-page-actions">
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
                  description={t("")}
                />
                {players.length === 0 ? (
                  <EmptyState
                    title={t("roster.emptyTitle")}
                    description={t("roster.emptyDescription")}
                  />
                ) : (
                  <div className="player-card-list">
                    {players.map((player) => (
                      <article
                        className="player-summary-card"
                        key={player.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openPlayerDetails(player)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openPlayerDetails(player);
                          }
                        }}
                      >
                        <PlayerPhoto
                          firstName={player.first_name}
                          lastName={player.last_name}
                          src={player.image_url ? resolveApiUrl(player.image_url) : null}
                          alt={t("common.playerImageAlt", {
                            name: `${player.first_name} ${player.last_name}`,
                          })}
                          className="player-summary-photo"
                        />
                        <div className="player-summary-body">
                          <div className="player-summary-head">
                            <div className="player-summary-name">
                              <p>{player.first_name}</p>
                              <h3>{player.last_name}</h3>
                            </div>
                            <span className="player-summary-number">{player.number ?? "-"}</span>
                          </div>
                          <span className="player-summary-divider" aria-hidden="true" />
                          <p className="player-summary-position">{player.position ?? "-"}</p>
                          <p className="player-summary-meta">
                            {`${player.games_played ?? 0} GP / ${player.bats ?? "-"} / ${player.throws ?? "-"}`}
                          </p>
                          <p className="player-summary-submeta">{teamDisplayName}</p>
                          <div className="player-summary-footer">
                            <button
                              className="button button-secondary button-small"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openPlayerDetails(player);
                              }}
                            >
                              {t("buttons.viewDetails")}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
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
                <button
                  className="game-details-close"
                  type="button"
                  onClick={closeModal}
                  aria-label={t("buttons.close")}
                >
                  <span aria-hidden="true">x</span>
                </button>
              }
            />
            <form className="form-grid player-form-grid" onSubmit={handleSavePlayer}>
              <label className="field player-form-field-wide">
                <span>{t("roster.modal.firstName")}</span>
                <input
                  value={formData.first_name}
                  onChange={(event) => handleFormChange("first_name", event.target.value)}
                />
              </label>
              <label className="field player-form-field-wide">
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
              <label className="field player-form-photo-field player-form-field-wide">
                <span>{t("roster.modal.photo")}</span>
                <div className="player-form-photo-row">
                  <PlayerPhoto
                    firstName={formData.first_name}
                    lastName={formData.last_name}
                    src={formImagePreview}
                    alt={t("common.playerImageAlt", {
                      name: `${formData.first_name || ""} ${formData.last_name || ""}`.trim() || teamDisplayName,
                    })}
                    className="player-form-photo-preview"
                  />
                  <div className="player-form-photo-actions">
                    <label className="button button-secondary file-button-inline">
                      {t("buttons.uploadImage")}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          event.currentTarget.value = "";
                          handleFormImageChange(file);
                        }}
                      />
                    </label>
                    <p>{t("roster.modal.photoHelp")}</p>
                  </div>
                </div>
              </label>
              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? t("common.saveInProgress") : t("roster.modal.savePlayer")}
                </button>
                {editingPlayer ? (
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => setPlayerDeleteTarget(editingPlayer)}
                    disabled={deletingId === editingPlayer.id}
                  >
                    {deletingId === editingPlayer.id ? t("common.deleteInProgress") : t("buttons.delete")}
                  </button>
                ) : null}
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

      {selectedPlayer && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePlayerDetails();
            }
          }}
        >
          <SurfaceCard className="modal-card player-detail-modal">
            <SectionHeader
              title={`${selectedPlayer.first_name} ${selectedPlayer.last_name}`}
              description={teamDisplayName}
              action={
                <div className="player-detail-header-actions">
                  {isAdmin ? (
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={openEditFromDetails}
                    >
                      {t("buttons.edit")}
                    </button>
                  ) : null}
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={closePlayerDetails}
                  >
                    {t("buttons.close")}
                  </button>
                </div>
              }
            />

            {playerSummaryLoading ? <LoadingState label={t("roster.playerDetailLoading")} /> : null}
            {playerSummaryError ? <Notice variant="error">{playerSummaryError}</Notice> : null}

            {!playerSummaryLoading && playerSummary ? (
              <>
                <div className="player-detail-identity">
                  <PlayerPhoto
                    firstName={selectedPlayer.first_name}
                    lastName={selectedPlayer.last_name}
                    src={selectedPlayer.image_url ? resolveApiUrl(selectedPlayer.image_url) : null}
                    alt={t("common.playerImageAlt", {
                      name: `${selectedPlayer.first_name} ${selectedPlayer.last_name}`,
                    })}
                    className="player-detail-photo"
                  />
                  <div className="player-detail-copy">
                    <div className="player-detail-topline">
                      <div>
                        <p className="player-detail-name">
                          {selectedPlayer.first_name} {selectedPlayer.last_name}
                        </p>
                        <p className="player-detail-team">{teamDisplayName}</p>
                      </div>
                      <span className="player-summary-number">{selectedPlayer.number ?? "-"}</span>
                    </div>
                    <p className="player-summary-position">{selectedPlayer.position ?? "-"}</p>
                    <p className="player-detail-meta">
                      {`${t("common.bats")}: ${selectedPlayer.bats ?? "-"} / ${t("common.throws")}: ${selectedPlayer.throws ?? "-"}`}
                    </p>
                  </div>
                </div>
                <div className="player-detail-stats">
                  <div className="summary-stat">
                    <span>{t("common.gamesPlayed")}</span>
                    <strong>{playerSummary.total_games_played}</strong>
                  </div>
                  <div className="summary-stat">
                    <span>{t("common.eligibility")}</span>
                    <strong>
                      <StatusChip tone={playerSummary.eligible ? "success" : "danger"}>
                        {playerSummary.eligible ? t("roster.eligible") : t("roster.notEligible")}
                      </StatusChip>
                    </strong>
                  </div>
                </div>
                <p className="player-detail-minimum">
                  {t("games.minimumRequiredLabel", {
                    count: playerSummary.minimum_required_games,
                  })}
                </p>

                <div className="player-history-block">
                  <h3 className="player-history-title">{t("roster.historyTitle")}</h3>
                  {playerSummary.history.length === 0 ? (
                    <EmptyState
                      compact
                      title={t("roster.historyEmptyTitle")}
                      description={t("roster.historyEmptyDescription")}
                    />
                  ) : (
                    <div className="player-history-list">
                      {playerSummary.history.map((item) => (
                        <article className="player-history-item" key={`${item.game_id}-${item.game_date}`}>
                          <div className="player-history-row">
                            <span className="player-history-label">{t("common.date")}</span>
                            <strong>{formatDate(item.game_date)}</strong>
                          </div>
                          <div className="player-history-row">
                            <span className="player-history-label">{t("roster.historyMatchupLabel")}</span>
                            <span>{item.matchup}</span>
                          </div>
                          <div className="player-history-row">
                            <span className="player-history-label">{t("roster.historyOpponentLabel")}</span>
                            <span>
                              {item.opponent_team_name ??
                                t("common.teamFallback", { id: item.opponent_team_id ?? "" })}
                            </span>
                          </div>
                          <div className="player-history-row">
                            <span className="player-history-label">{t("roster.historyGameLabel")}</span>
                            <span>{t("roster.historyGameId", { id: item.game_id })}</span>
                          </div>
                          <div className="player-history-row">
                            <span className="player-history-label">{t("common.field")}</span>
                            <span>{item.field || t("common.fieldTbd")}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </SurfaceCard>
        </div>
      )}
    </section>
  );
}
