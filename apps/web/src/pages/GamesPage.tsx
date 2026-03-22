import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  AuthError,
  PermissionError,
  clearGames,
  createGame,
  deleteGame,
  fetchGames,
  fetchGamesPublic,
  fetchTeams,
  fetchTeamsPublic,
  getCachedGames,
  getCachedTeams,
  importGamesCsv,
  resolveApiUrl,
  updateGame,
} from "../api";
import type { Game, ImportGamesResult, Team } from "../api";
import { GameDetailsDialog } from "../components/GameDetailsDialog";
import { PublicGameCard } from "../components/PublicGameCard";
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
  buildTeamMap,
  formatTime,
  getGameScore,
  getGameShortLocation,
  getGameStatusMeta,
  groupGamesByDate,
  isFinalGame,
  parseDateOnly,
} from "../utils/league";

type GamesPageProps = {
  authed: boolean;
  isAdmin: boolean;
  onAuthError: () => void;
};

const emptyForm = {
  date: "",
  time: "",
  field: "",
  home_team_id: "",
  away_team_id: "",
  status: "SCHEDULED",
  home_score: "",
  away_score: "",
};

export default function GamesPage({ authed, isAdmin, onAuthError }: GamesPageProps) {
  const { t } = useTranslation();
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
  const [filters, setFilters] = useState({
    window: "all",
    teamId: "all",
    status: "all",
  });
  const [browseScheduleOpen, setBrowseScheduleOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [editData, setEditData] = useState(emptyForm);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const browseScheduleRef = useRef<HTMLDivElement | null>(null);

  const statusOptions = [
    { value: "SCHEDULED", label: t("games.status.scheduled") },
    { value: "IN_PROGRESS", label: t("games.status.inProgress") },
    { value: "FINAL", label: t("games.status.final") },
    { value: "POSTPONED", label: t("games.status.postponed") },
    { value: "CANCELLED", label: t("games.status.cancelled") },
  ];

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
          setNotice(t("games.cachedTeamData"));
        } else {
          setError(t("games.teamDataTemporaryUnavailable"));
        }
      } else {
        setError(t("games.partialTeamData"));
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
          setNotice(t("games.cachedScheduleData"));
        } else {
          setError(t("games.temporaryUnavailable"));
        }
      } else if (
        gamesResult.status === "rejected" &&
        gamesResult.reason instanceof ApiError &&
        gamesResult.reason.status === 404
      ) {
        const cached = getCachedGames();
        if (cached && cached.length > 0) {
          setGames(cached);
          setNotice(t("games.cachedScheduleData"));
        } else {
          setEndpointMissing(true);
        }
      } else {
        setError(t("games.loadError"));
      }

      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [authed, isAdmin, onAuthError, t]);

  const teamMap = useMemo(() => buildTeamMap(teams), [teams]);

  const filteredGames = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inSevenDays = new Date(today);
    inSevenDays.setDate(inSevenDays.getDate() + 7);

    return games.filter((game) => {
      const gameDate = parseDateOnly(game.date);
      const normalizedStatus = (game.status ?? "SCHEDULED").toUpperCase();

      if (filters.teamId !== "all") {
        const teamId = Number(filters.teamId);
        if (game.home_team_id !== teamId && game.away_team_id !== teamId) return false;
      }

      if (filters.status !== "all" && normalizedStatus !== filters.status) {
        return false;
      }

      if (filters.window === "today") {
        if (!gameDate || gameDate.getTime() !== today.getTime()) return false;
      }
      if (filters.window === "next7") {
        if (!gameDate || gameDate < today || gameDate > inSevenDays) return false;
      }
      if (filters.window === "upcoming") {
        if (!gameDate || gameDate < today) return false;
      }
      if (filters.window === "final") {
        if (normalizedStatus !== "FINAL") return false;
      }

      return true;
    });
  }, [filters, games]);

  const groupedGames = useMemo(() => groupGamesByDate(filteredGames), [filteredGames]);
  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  useEffect(() => {
    if (selectedGameId != null && !selectedGame) {
      setSelectedGameId(null);
    }
  }, [selectedGame, selectedGameId]);

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const getGameDisplayData = (game: Game) => {
    const away = teamMap[game.away_team_id];
    const home = teamMap[game.home_team_id];

    return {
      awayTeamName: away?.name ?? t("common.teamFallback", { id: game.away_team_id }),
      awayTeamLogoSrc: away?.logo_url ? resolveApiUrl(away.logo_url) : null,
      homeTeamName: home?.name ?? t("common.teamFallback", { id: game.home_team_id }),
      homeTeamLogoSrc: home?.logo_url ? resolveApiUrl(home.logo_url) : null,
    };
  };

  const handleBrowseScheduleToggle = () => {
    setBrowseScheduleOpen((prev) => {
      const next = !prev;
      if (next) {
        window.requestAnimationFrame(() => {
          browseScheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  };

  const handleFormChange = (field: keyof typeof emptyForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field: keyof typeof emptyForm, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const formatDateInput = (value: string) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
    return parsed.toISOString().slice(0, 10);
  };

  const handleCreateGame = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    if (!formData.date || !formData.home_team_id || !formData.away_team_id) {
      setFormError(t("games.requiredError"));
      return;
    }

    if (formData.home_team_id === formData.away_team_id) {
      setFormError(t("games.sameTeamsError"));
      return;
    }

    setSaving(true);
    try {
      const created = await createGame({
        date: formData.date,
        time: formData.time || null,
        field: formData.field || null,
        home_team_id: Number(formData.home_team_id),
        away_team_id: Number(formData.away_team_id),
        status: formData.status,
        home_score: formData.home_score ? Number(formData.home_score) : null,
        away_score: formData.away_score ? Number(formData.away_score) : null,
      });
      setGames((prev) => [...prev, created]);
      setFormData(emptyForm);
      setFormOpen(false);
      setNotice(t("games.gameAdded"));
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
      setFormError(t("games.addError"));
    } finally {
      setSaving(false);
    }
  };

  const handleEditStart = (game: Game) => {
    setEditingGame(game);
    setEditError(null);
    setEditData({
      date: formatDateInput(game.date),
      time: game.time ?? "",
      field: game.field ?? "",
      home_team_id: String(game.home_team_id),
      away_team_id: String(game.away_team_id),
      status: game.status ?? "SCHEDULED",
      home_score: game.home_score != null ? String(game.home_score) : "",
      away_score: game.away_score != null ? String(game.away_score) : "",
    });
  };

  const handleEditSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingGame) return;
    setEditError(null);
    setNotice(null);
    setEditSaving(true);
    try {
      const updated = await updateGame(editingGame.id, {
        date: editData.date || undefined,
        time: editData.time || null,
        field: editData.field || null,
        home_team_id: Number(editData.home_team_id),
        away_team_id: Number(editData.away_team_id),
        status: editData.status || undefined,
        home_score: editData.home_score === "" ? null : Number(editData.home_score),
        away_score: editData.away_score === "" ? null : Number(editData.away_score),
      });
      setGames((prev) => prev.map((game) => (game.id === updated.id ? updated : game)));
      setEditingGame(null);
      setNotice(t("games.gameUpdated"));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setEditError(t("auth.adminAccessRequired"));
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setEditError(err.detail);
        return;
      }
      setEditError(t("games.updateError"));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteGame = async (gameId: number) => {
    if (!window.confirm(t("games.deleteConfirm"))) return;
    setDeletingId(gameId);
    setError(null);
    setNotice(null);
    try {
      await deleteGame(gameId);
      setGames((prev) => prev.filter((game) => game.id !== gameId));
      setNotice(t("games.gameRemoved"));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError(t("auth.adminAccessRequired"));
        return;
      }
      setError(t("games.deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearGames = async () => {
    const confirmed = window.confirm(t("games.clearAllConfirm"));
    if (!confirmed) return;
    setDeletingId(-1);
    setError(null);
    setNotice(null);
    try {
      await clearGames();
      setGames([]);
      setNotice(t("games.allGamesCleared"));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError(t("auth.adminAccessRequired"));
        return;
      }
      setError(t("games.clearError"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleImportGames = async (file: File) => {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    setNotice(null);
    try {
      const result = await importGamesCsv(file);
      setImportResult(result);
      setFileInputKey((prev) => prev + 1);
      const [freshGames, freshTeams] = await Promise.all([fetchGames(), fetchTeams()]);
      setGames(freshGames);
      setTeams(freshTeams);
      setNotice(t("games.csvProcessed"));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setImportError(t("auth.adminAccessRequired"));
        return;
      }
      setImportError(t("games.importError"));
    } finally {
      setImporting(false);
    }
  };

  const handleOpenGameDetails = (gameId: number) => {
    setSelectedGameId(gameId);
  };

  const handleCloseGameDetails = () => {
    setSelectedGameId(null);
  };

  const handleEditFromDetails = () => {
    if (!selectedGame) return;
    handleCloseGameDetails();
    handleEditStart(selectedGame);
  };

  const handleDeleteFromDetails = async () => {
    if (!selectedGame) return;
    handleCloseGameDetails();
    await handleDeleteGame(selectedGame.id);
  };

  const selectedGameDisplayData = selectedGame ? getGameDisplayData(selectedGame) : null;

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow=""
        title={t("games.title")}
        description=""
        titleAction={
          <button
            className="schedule-browser-icon-button"
            type="button"
            onClick={handleBrowseScheduleToggle}
            aria-label={browseScheduleOpen ? t("games.hideScheduleBrowser") : t("games.browseSchedule")}
            aria-pressed={browseScheduleOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 3v2M17 3v2M4 8h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 6h3v3H8zm5 0h3v3h-3zM8 15h3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="visually-hidden">
              {browseScheduleOpen ? t("games.hideScheduleBrowser") : t("games.browseSchedule")}
            </span>
            
          </button> 
        }
      />

      {isAdmin && (
        <SurfaceCard className="admin-ops-card">
          <SectionHeader title={t("games.scheduleOperations")} description="" />
          <div className="admin-ops-actions">
            <button
              className="button button-danger"
              type="button"
              onClick={handleClearGames}
              disabled={deletingId === -1}
            >
              {deletingId === -1 ? t("games.clearing") : t("games.clearAll")}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => setFormOpen((prev) => !prev)}
            >
              {formOpen ? t("common.closeForm") : t("buttons.addGame")}
            </button>
            <label className="button button-secondary file-button-inline">
              {importing ? `${t("buttons.importCsv")}...` : t("buttons.importCsv")}
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
          </div>
          {importError && <Notice variant="error">{importError}</Notice>}
          {importResult && (
            <Notice variant="success">
              {t("games.importSummary", {
                created: importResult.created,
                updated: importResult.updated,
                skipped: importResult.skipped,
                errors: importResult.errors.length,
              })}
            </Notice>
          )}
        </SurfaceCard>
      )}

      {browseScheduleOpen && (
        <div ref={browseScheduleRef}>
          <SurfaceCard>
            <SectionHeader
              title={t("games.browseSchedule")}
              description={t("games.browseDescription")}
            />
            <div className="filter-grid">
              <label className="field">
                <span>{t("common.window")}</span>
                <select
                  value={filters.window}
                  onChange={(event) => handleFilterChange("window", event.target.value)}
                >
                  <option value="all">{t("games.filters.allDates")}</option>
                  <option value="today">{t("games.filters.today")}</option>
                  <option value="next7">{t("games.filters.next7")}</option>
                  <option value="upcoming">{t("games.filters.upcoming")}</option>
                  <option value="final">{t("games.filters.finalOnly")}</option>
                </select>
              </label>
              <label className="field">
                <span>{t("common.team")}</span>
                <select
                  value={filters.teamId}
                  onChange={(event) => handleFilterChange("teamId", event.target.value)}
                >
                  <option value="all">{t("games.filters.allTeams")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("common.status")}</span>
                <select
                  value={filters.status}
                  onChange={(event) => handleFilterChange("status", event.target.value)}
                >
                  <option value="all">{t("games.filters.allStatuses")}</option>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </SurfaceCard>
        </div>
      )}

      {loading && <LoadingState label={t("games.loading")} />}
      {!loading && endpointMissing && (
        <Notice variant="warning">{t("games.endpointMissing")}</Notice>
      )}
      {!loading && notice && <Notice variant="success">{notice}</Notice>}
      {!loading && error && <Notice variant="error">{error}</Notice>}

      {!loading && !error && !endpointMissing && (
        <>
          {groupedGames.length === 0 ? (
            <SurfaceCard>
              <EmptyState
                title={t("games.emptyTitle")}
                description={t("games.emptyDescription")}
              />
            </SurfaceCard>
          ) : (
            <div className="schedule-groups">
              {groupedGames.map((group) => (
                <SurfaceCard key={group.key}>
                  <SectionHeader
                    title={group.label}
                    description={t("games.groupCount", { count: group.games.length })}
                  />
                  <div className="schedule-list schedule-list-desktop">
                    {group.games.map((game) => {
                      const {
                        awayTeamName,
                        awayTeamLogoSrc,
                        homeTeamName,
                        homeTeamLogoSrc,
                      } = getGameDisplayData(game);

                      return (
                        <div key={game.id} className="schedule-game-card-shell">
                          <PublicGameCard
                            className="schedule-game-card"
                            game={game}
                            awayTeamName={awayTeamName}
                            awayTeamLogoSrc={awayTeamLogoSrc}
                            homeTeamName={homeTeamName}
                            homeTeamLogoSrc={homeTeamLogoSrc}
                            avatarSize="xl"
                            footer={
                              isAdmin ? (
                                <div className="table-actions">
                                  <button
                                    className="button button-secondary button-small"
                                    type="button"
                                    onClick={() => handleEditStart(game)}
                                  >
                                    {t("buttons.edit")}
                                  </button>
                                  <button
                                    className="button button-danger button-small"
                                    type="button"
                                    onClick={() => handleDeleteGame(game.id)}
                                    disabled={deletingId === game.id}
                                  >
                                    {deletingId === game.id ? t("common.deleteInProgress") : t("buttons.delete")}
                                  </button>
                                </div>
                              ) : null
                            }
                          />
                          <button
                            className="schedule-card-overlay"
                            type="button"
                            aria-label={t("games.viewDetailsFor", { awayTeamName, homeTeamName })}
                            onClick={() => handleOpenGameDetails(game.id)}
                          >
                            <span className="visually-hidden">{t("buttons.viewDetails")}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="schedule-mobile-list">
                    {group.games.map((game) => {
                      const {
                        awayTeamName,
                        awayTeamLogoSrc,
                        homeTeamName,
                        homeTeamLogoSrc,
                      } = getGameDisplayData(game);
                      const status = getGameStatusMeta(game.status);
                      const finalGame = isFinalGame(game.status);
                      const score = getGameScore(game);
                      const location = getGameShortLocation(game);

                      return (
                        <div key={game.id} className="schedule-mobile-row-shell">
                          <article className="schedule-mobile-row">
                            <div className="schedule-mobile-row-topline">
                              <p className="schedule-mobile-row-meta">
                                <span>{formatTime(game.time)}</span>
                                <span aria-hidden="true">•</span>
                                <span>{location}</span>
                              </p>
                              <StatusChip tone={status.tone}>{status.label}</StatusChip>
                            </div>

                            <div className="schedule-mobile-row-body">
                              <div className="schedule-mobile-row-team-list">
                                <div className="schedule-mobile-row-team">
                                  <div className="schedule-mobile-row-team-copy">
                                    <TeamAvatar
                                      name={awayTeamName}
                                      src={awayTeamLogoSrc}
                                      size="sm"
                                    />
                                    <span className="schedule-mobile-row-team-name">{awayTeamName}</span>
                                  </div>
                                  {finalGame && score ? (
                                    <span className="schedule-mobile-row-team-score">{score.away}</span>
                                  ) : null}
                                </div>

                                <div className="schedule-mobile-row-team">
                                  <div className="schedule-mobile-row-team-copy">
                                    <TeamAvatar
                                      name={homeTeamName}
                                      src={homeTeamLogoSrc}
                                      size="sm"
                                    />
                                    <span className="schedule-mobile-row-team-name">{homeTeamName}</span>
                                  </div>
                                  {finalGame && score ? (
                                    <span className="schedule-mobile-row-team-score">{score.home}</span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="schedule-mobile-row-summary" />
                            </div>

                            <div className="schedule-mobile-row-footer">
                              <span className="schedule-mobile-row-detail-button" aria-hidden="true">
                                {t("games.detailsLink")}
                              </span>
                            </div>
                          </article>
                          <button
                            className="schedule-mobile-row-overlay"
                            type="button"
                            aria-label={t("games.viewDetailsFor", { awayTeamName, homeTeamName })}
                            onClick={() => handleOpenGameDetails(game.id)}
                          >
                            <span className="visually-hidden">{t("buttons.viewDetails")}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </SurfaceCard>
              ))}
            </div>
          )}
        </>
      )}

      {isAdmin && formOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <SurfaceCard className="modal-card">
            <SectionHeader
              title={t("games.modal.addTitle")}
              description={t("games.modal.addDescription")}
              action={
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setFormError(null);
                  }}
                >
                  {t("buttons.close")}
                </button>
              }
            />
            <form className="form-grid" onSubmit={handleCreateGame}>
              <label className="field">
                <span>{t("common.date")}</span>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(event) => handleFormChange("date", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.time")}</span>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(event) => handleFormChange("time", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.field")}</span>
                <input
                  value={formData.field}
                  onChange={(event) => handleFormChange("field", event.target.value)}
                  placeholder={t("games.modal.fieldPlaceholder")}
                />
              </label>
              <label className="field">
                <span>{t("common.awayTeam")}</span>
                <select
                  value={formData.away_team_id}
                  onChange={(event) => handleFormChange("away_team_id", event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("common.homeTeam")}</span>
                <select
                  value={formData.home_team_id}
                  onChange={(event) => handleFormChange("home_team_id", event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("common.status")}</span>
                <select
                  value={formData.status}
                  onChange={(event) => handleFormChange("status", event.target.value)}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("common.awayScore")}</span>
                <input
                  type="number"
                  min="0"
                  value={formData.away_score}
                  onChange={(event) => handleFormChange("away_score", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.homeScore")}</span>
                <input
                  type="number"
                  min="0"
                  value={formData.home_score}
                  onChange={(event) => handleFormChange("home_score", event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? t("common.saveInProgress") : t("games.modal.saveGame")}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setFormError(null);
                  }}
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>
            {formError && <Notice variant="error">{formError}</Notice>}
          </SurfaceCard>
        </div>
      )}

      {isAdmin && editingGame && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <SurfaceCard className="modal-card">
            <SectionHeader
              title={t("games.modal.editTitle")}
              description={t("games.modal.editDescription")}
              action={
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setEditingGame(null);
                    setEditError(null);
                  }}
                >
                  {t("buttons.close")}
                </button>
              }
            />
            <form className="form-grid" onSubmit={handleEditSave}>
              <label className="field">
                <span>{t("common.date")}</span>
                <input
                  type="date"
                  value={editData.date}
                  onChange={(event) => handleEditChange("date", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.time")}</span>
                <input
                  type="time"
                  value={editData.time}
                  onChange={(event) => handleEditChange("time", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.field")}</span>
                <input
                  value={editData.field}
                  onChange={(event) => handleEditChange("field", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.awayTeam")}</span>
                <select
                  value={editData.away_team_id}
                  onChange={(event) => handleEditChange("away_team_id", event.target.value)}
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("common.homeTeam")}</span>
                <select
                  value={editData.home_team_id}
                  onChange={(event) => handleEditChange("home_team_id", event.target.value)}
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("common.status")}</span>
                <select
                  value={editData.status}
                  onChange={(event) => handleEditChange("status", event.target.value)}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("common.awayScore")}</span>
                <input
                  type="number"
                  min="0"
                  value={editData.away_score}
                  onChange={(event) => handleEditChange("away_score", event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("common.homeScore")}</span>
                <input
                  type="number"
                  min="0"
                  value={editData.home_score}
                  onChange={(event) => handleEditChange("home_score", event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={editSaving}>
                  {editSaving ? t("common.saveInProgress") : t("games.modal.updateGame")}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    setEditingGame(null);
                    setEditError(null);
                  }}
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>
            {editError && <Notice variant="error">{editError}</Notice>}
          </SurfaceCard>
        </div>
      )}

      <GameDetailsDialog
        game={selectedGame}
        awayTeam={
          selectedGame && selectedGameDisplayData
            ? {
                name: selectedGameDisplayData.awayTeamName,
                logoSrc: selectedGameDisplayData.awayTeamLogoSrc,
              }
            : null
        }
        homeTeam={
          selectedGame && selectedGameDisplayData
            ? {
                name: selectedGameDisplayData.homeTeamName,
                logoSrc: selectedGameDisplayData.homeTeamLogoSrc,
              }
            : null
        }
        onClose={handleCloseGameDetails}
        footer={
          isAdmin && selectedGame ? (
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={handleEditFromDetails}
              >
                {t("games.modal.editGame")}
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => {
                  void handleDeleteFromDetails();
                }}
                disabled={deletingId === selectedGame.id}
              >
                {deletingId === selectedGame.id ? t("common.deleteInProgress") : t("games.modal.deleteGame")}
              </button>
            </>
          ) : null
        }
      />
    </section>
  );
}
