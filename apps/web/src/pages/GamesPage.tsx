import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ApiError,
  AuthError,
  PermissionError,
  clearGames,
  createGame,
  deleteGame,
  fetchGames,
  fetchGameLineup,
  fetchGamesPublic,
  fetchTeams,
  fetchTeamsPublic,
  getCachedGames,
  getCachedTeams,
  importGamesCsv,
  importRosterCsv,
  resolveApiUrl,
  saveGameLineup,
  updateGame,
} from "../api";
import type { Game, GameLineup, Team, UserRole } from "../api";
import { CsvImportModal } from "../components/CsvImportModal";
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
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import {
  transformScheduleCsvForImport,
  type CsvImportMode,
  type CsvImportResult,
} from "../utils/csvImport";
import {
  buildTeamMap,
  formatFullGameDate,
  formatTime,
  getCurrentScheduleGroupKey,
  getGameTeamData,
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
  role: UserRole | null;
  managerTeamId: number | null;
  onAuthError: () => void;
};

const CUSTOM_TEAM_VALUE = "__custom__";

const emptyForm = {
  date: "",
  time: "",
  field: "",
  home_team_id: "",
  away_team_id: "",
  home_team_mode: "",
  away_team_mode: "",
  home_team_name: "",
  away_team_name: "",
  status: "SCHEDULED",
  home_score: "",
  away_score: "",
};

const emptyScoreForm = {
  away_score: "",
  home_score: "",
};

export default function GamesPage({
  authed,
  isAdmin,
  role,
  managerTeamId,
  onAuthError,
}: GamesPageProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importModalMode, setImportModalMode] = useState<CsvImportMode>("schedule");
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [lineupGame, setLineupGame] = useState<Game | null>(null);
  const [lineupState, setLineupState] = useState<GameLineup | null>(null);
  const [lineupSelectedIds, setLineupSelectedIds] = useState<number[]>([]);
  const [lineupLoading, setLineupLoading] = useState(false);
  const [lineupSaving, setLineupSaving] = useState(false);
  const [lineupError, setLineupError] = useState<string | null>(null);
  const [scoreGame, setScoreGame] = useState<Game | null>(null);
  const [scoreData, setScoreData] = useState(emptyScoreForm);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    window: "all",
    teamId: "all",
    status: "all",
  });
  const [browseScheduleOpen, setBrowseScheduleOpen] = useState(false);
  const [scheduleOperationsOpen, setScheduleOperationsOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [editData, setEditData] = useState(emptyForm);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const scheduleGroupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasAutoScrolledToCurrentGroupRef = useRef(false);

  useBodyScrollLock(formOpen || !!editingGame || !!lineupGame || !!scoreGame || importModalOpen);

  const statusOptions = [
    { value: "SCHEDULED", label: t("games.status.scheduled") },
    { value: "IN_PROGRESS", label: t("games.status.inProgress") },
    { value: "FINAL", label: t("games.status.final") },
    { value: "POSTPONED", label: t("games.status.postponed") },
    { value: "CANCELLED", label: t("games.status.cancelled") },
  ];

  useEffect(() => {
    const state = location.state as { selectedGameId?: number } | null;
    if (typeof state?.selectedGameId !== "number") return;

    setSelectedGameId(state.selectedGameId);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

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
  const isManager = authed && role === "manager" && managerTeamId != null;

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

  const groupedGames = useMemo(() => groupGamesByDate(filteredGames, games), [filteredGames, games]);
  const currentScheduleGroupKey = useMemo(
    () => getCurrentScheduleGroupKey(groupedGames),
    [groupedGames],
  );
  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );
  const lineupSelectedSet = useMemo(() => new Set(lineupSelectedIds), [lineupSelectedIds]);
  const lineupTeams = useMemo(() => {
    if (!lineupState) return [];
    return [lineupState.away_team, lineupState.home_team].filter((team) =>
      lineupState.visible_team_ids.includes(team.team_id),
    );
  }, [lineupState]);

  useEffect(() => {
    if (selectedGameId != null && !selectedGame) {
      setSelectedGameId(null);
    }
  }, [selectedGame, selectedGameId]);

  useEffect(() => {
    if (!lineupGame) {
      setLineupState(null);
      setLineupSelectedIds([]);
      setLineupLoading(false);
      setLineupSaving(false);
      setLineupError(null);
      return;
    }

    let active = true;
    setLineupLoading(true);
    setLineupError(null);
    setLineupState(null);
    setLineupSelectedIds([]);

    void fetchGameLineup(lineupGame.id)
      .then((payload) => {
        if (!active) return;
        setLineupState(payload);
        setLineupSelectedIds(payload.selected_player_ids);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof AuthError) {
          onAuthError();
          return;
        }
        if (err instanceof PermissionError) {
          setLineupError(err.detail ?? t("auth.restrictedAccess"));
          return;
        }
        if (err instanceof ApiError && err.detail) {
          setLineupError(err.detail);
          return;
        }
        setLineupError(t("games.lineup.loadError"));
      })
      .finally(() => {
        if (active) {
          setLineupLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [lineupGame, onAuthError, t]);

  useEffect(() => {
    if (loading || error || endpointMissing || hasAutoScrolledToCurrentGroupRef.current) return;
    if (!currentScheduleGroupKey) return;

    const target = scheduleGroupRefs.current[currentScheduleGroupKey];
    if (!target) return;

    hasAutoScrolledToCurrentGroupRef.current = true;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, [currentScheduleGroupKey, endpointMissing, error, loading]);

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const getGameDisplayData = (game: Game) => {
    const away = getGameTeamData(game, "away", teamMap);
    const home = getGameTeamData(game, "home", teamMap);

    return {
      awayTeamName: away.name,
      awayTeamLogoSrc: away.team?.logo_url ? resolveApiUrl(away.team.logo_url) : null,
      homeTeamName: home.name,
      homeTeamLogoSrc: home.team?.logo_url ? resolveApiUrl(home.team.logo_url) : null,
    };
  };

  const canManageLineupForGame = (game: Game) =>
    game.home_team_id != null &&
    game.away_team_id != null &&
    authed &&
    (isAdmin ||
      (isManager &&
        managerTeamId != null &&
        [game.home_team_id, game.away_team_id].includes(managerTeamId)));

  const getTeamSelectValue = (data: typeof emptyForm, side: "home" | "away") => {
    const teamId = side === "home" ? data.home_team_id : data.away_team_id;
    if (teamId) return teamId;
    const teamMode = side === "home" ? data.home_team_mode : data.away_team_mode;
    if (teamMode === "custom") return CUSTOM_TEAM_VALUE;
    return "";
  };

  const resolveFormTeamSelection = (data: typeof emptyForm, side: "home" | "away") => {
    const teamIdValue = side === "home" ? data.home_team_id : data.away_team_id;
    const teamNameValue = side === "home" ? data.home_team_name : data.away_team_name;
    const normalizedTeamName = teamNameValue.trim();

    if (teamIdValue) {
      const teamId = Number(teamIdValue);
      const teamName = teamMap[teamId]?.name ?? String(teamId);
      return {
        teamId,
        teamName: null,
        identity: teamName.trim().toLocaleLowerCase(),
      };
    }

    if (normalizedTeamName) {
      return {
        teamId: null,
        teamName: normalizedTeamName,
        identity: normalizedTeamName.toLocaleLowerCase(),
      };
    }

    return null;
  };

  const handleBrowseScheduleToggle = () => {
    setBrowseScheduleOpen((prev) => !prev);
  };

  const handleScheduleOperationsToggle = () => {
    setScheduleOperationsOpen((prev) => !prev);
  };

  const handleFormChange = (field: keyof typeof emptyForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field: keyof typeof emptyForm, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormTeamSelectChange = (side: "home" | "away", value: string) => {
    setFormData((prev) => {
      if (side === "home") {
        return {
          ...prev,
          home_team_id: value && value !== CUSTOM_TEAM_VALUE ? value : "",
          home_team_mode: value === CUSTOM_TEAM_VALUE ? "custom" : "",
          home_team_name:
            value === CUSTOM_TEAM_VALUE ? prev.home_team_name : "",
        };
      }

      return {
        ...prev,
        away_team_id: value && value !== CUSTOM_TEAM_VALUE ? value : "",
        away_team_mode: value === CUSTOM_TEAM_VALUE ? "custom" : "",
        away_team_name:
          value === CUSTOM_TEAM_VALUE ? prev.away_team_name : "",
      };
    });
  };

  const handleEditTeamSelectChange = (side: "home" | "away", value: string) => {
    setEditData((prev) => {
      if (side === "home") {
        return {
          ...prev,
          home_team_id: value && value !== CUSTOM_TEAM_VALUE ? value : "",
          home_team_mode: value === CUSTOM_TEAM_VALUE ? "custom" : "",
          home_team_name:
            value === CUSTOM_TEAM_VALUE ? prev.home_team_name : "",
        };
      }

      return {
        ...prev,
        away_team_id: value && value !== CUSTOM_TEAM_VALUE ? value : "",
        away_team_mode: value === CUSTOM_TEAM_VALUE ? "custom" : "",
        away_team_name:
          value === CUSTOM_TEAM_VALUE ? prev.away_team_name : "",
      };
    });
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

    if (!formData.date) {
      setFormError(t("games.requiredError"));
      return;
    }

    const homeSelection = resolveFormTeamSelection(formData, "home");
    const awaySelection = resolveFormTeamSelection(formData, "away");

    if (!homeSelection || !awaySelection) {
      setFormError(t("games.customTeamNameRequired"));
      return;
    }

    if (homeSelection.identity === awaySelection.identity) {
      setFormError(t("games.sameTeamsError"));
      return;
    }

    setSaving(true);
    try {
      const created = await createGame({
        date: formData.date,
        time: formData.time || null,
        field: formData.field || null,
        home_team_id: homeSelection.teamId,
        away_team_id: awaySelection.teamId,
        home_team_name: homeSelection.teamName,
        away_team_name: awaySelection.teamName,
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
      home_team_id: game.home_team_id != null ? String(game.home_team_id) : "",
      away_team_id: game.away_team_id != null ? String(game.away_team_id) : "",
      home_team_mode: game.home_team_id == null && (game.home_team_name ?? "").trim() ? "custom" : "",
      away_team_mode: game.away_team_id == null && (game.away_team_name ?? "").trim() ? "custom" : "",
      home_team_name: game.home_team_name ?? "",
      away_team_name: game.away_team_name ?? "",
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

    const homeSelection = resolveFormTeamSelection(editData, "home");
    const awaySelection = resolveFormTeamSelection(editData, "away");

    if (!homeSelection || !awaySelection) {
      setEditError(t("games.customTeamNameRequired"));
      return;
    }

    if (homeSelection.identity === awaySelection.identity) {
      setEditError(t("games.sameTeamsError"));
      return;
    }

    setEditSaving(true);
    try {
      const updated = await updateGame(editingGame.id, {
        date: editData.date || undefined,
        time: editData.time || null,
        field: editData.field || null,
        home_team_id: homeSelection.teamId,
        away_team_id: awaySelection.teamId,
        home_team_name: homeSelection.teamName,
        away_team_name: awaySelection.teamName,
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

  const refreshAdminData = async () => {
    const [freshGames, freshTeams] = await Promise.all([fetchGames(), fetchTeams()]);
    setGames(freshGames);
    setTeams(freshTeams);
  };

  const handleScheduleCsvImport = async (file: File): Promise<CsvImportResult> => {
    setNotice(null);
    setError(null);

    try {
      const rawText = await file.text();
      const normalizedText = transformScheduleCsvForImport(rawText);
      const normalizedFile = new File([normalizedText], file.name, { type: "text/csv" });
      const result = await importGamesCsv(normalizedFile);
      await refreshAdminData();
      setNotice(t("games.csvProcessed"));
      return result;
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        throw new Error(t("auth.adminAccessRequired"));
      }
      if (err instanceof PermissionError) {
        throw new Error(err.detail ?? t("auth.adminAccessRequired"));
      }
      if (err instanceof ApiError && err.detail) {
        throw new Error(err.detail);
      }
      throw new Error(t("games.importError"));
    }
  };

  const handleRosterCsvImport = async (teamId: number, file: File): Promise<CsvImportResult> => {
    setNotice(null);
    setError(null);

    try {
      const result = await importRosterCsv(teamId, file);
      setNotice(t("roster.csvProcessed"));
      return result;
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        throw new Error(t("auth.adminAccessRequired"));
      }
      if (err instanceof PermissionError) {
        throw new Error(err.detail ?? t("auth.adminAccessRequired"));
      }
      if (err instanceof ApiError && err.detail) {
        throw new Error(err.detail);
      }
      throw new Error(t("roster.importError"));
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

  const handleOpenRecordFinalScore = (game: Game) => {
    setScoreGame(game);
    setScoreError(null);
    setScoreData({
      away_score: game.away_score != null ? String(game.away_score) : "",
      home_score: game.home_score != null ? String(game.home_score) : "",
    });
  };

  const handleCloseRecordFinalScore = () => {
    if (scoreSaving) return;
    setScoreGame(null);
    setScoreError(null);
    setScoreData(emptyScoreForm);
  };

  const handleScoreChange = (field: keyof typeof emptyScoreForm, value: string) => {
    setScoreData((prev) => ({ ...prev, [field]: value }));
  };

  const handleOpenLineup = (game: Game) => {
    setLineupGame(game);
    setLineupError(null);
  };

  const handleCloseLineup = () => {
    setLineupGame(null);
  };

  const handleToggleLineupPlayer = (playerId: number) => {
    setLineupSelectedIds((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId],
    );
  };

  const handleSaveLineup = async () => {
    if (!lineupGame) return;
    const confirmed = window.confirm(t("games.lineup.confirmSave"));
    if (!confirmed) return;

    setLineupSaving(true);
    setLineupError(null);
    setNotice(null);

    try {
      const saved = await saveGameLineup(lineupGame.id, {
        player_ids: lineupSelectedIds,
      });
      setLineupState(saved);
      setLineupSelectedIds(saved.selected_player_ids);
      setNotice(t("games.lineup.saveSuccess"));
      handleCloseLineup();
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setLineupError(err.detail ?? t("auth.restrictedAccess"));
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setLineupError(err.detail);
        return;
      }
      setLineupError(t("games.lineup.saveError"));
    } finally {
      setLineupSaving(false);
    }
  };

  const handleDeleteFromEdit = async () => {
    if (!editingGame) return;
    const gameToDelete = editingGame;
    setEditingGame(null);
    setEditError(null);
    await handleDeleteGame(gameToDelete.id);
  };

  const handleSaveFinalScore = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!scoreGame) return;

    const awayScore = Number(scoreData.away_score);
    const homeScore = Number(scoreData.home_score);

    if (
      scoreData.away_score.trim() === "" ||
      scoreData.home_score.trim() === "" ||
      !Number.isInteger(awayScore) ||
      !Number.isInteger(homeScore) ||
      awayScore < 0 ||
      homeScore < 0
    ) {
      setScoreError(t("games.finalScore.validationError"));
      return;
    }

    const confirmed = window.confirm(t("games.finalScore.confirmSave"));
    if (!confirmed) return;

    setScoreSaving(true);
    setScoreError(null);
    setNotice(null);

    try {
      const updated = await updateGame(scoreGame.id, {
        away_score: awayScore,
        home_score: homeScore,
        status: "FINAL",
      });
      setGames((prev) => prev.map((game) => (game.id === updated.id ? updated : game)));
      setNotice(t("games.finalScore.saveSuccess"));
      handleCloseRecordFinalScore();
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setScoreError(t("auth.adminAccessRequired"));
        return;
      }
      if (err instanceof ApiError && err.detail) {
        setScoreError(err.detail);
        return;
      }
      setScoreError(t("games.finalScore.saveError"));
    } finally {
      setScoreSaving(false);
    }
  };

  const selectedGameDisplayData = selectedGame ? getGameDisplayData(selectedGame) : null;
  const lineupModalTitle = lineupState?.matchup ?? (lineupGame ? getGameDisplayData(lineupGame) : null);
  const scoreModalTeams = scoreGame ? getGameDisplayData(scoreGame) : null;

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow=""
        title={t("games.title")}
        description=""
        titleAction={
          <div className="schedule-page-toolbar">
            <button
              className={`schedule-browser-icon-button schedule-toolbar-button ${
                isAdmin ? "" : "schedule-toolbar-button-compact"
              }`}
              type="button"
              onClick={handleBrowseScheduleToggle}
              aria-label={browseScheduleOpen ? t("games.hideScheduleBrowser") : t("games.browseSchedule")}
              aria-pressed={browseScheduleOpen}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M10.5 5.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10Zm0 0v0M15 15l4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="schedule-toolbar-button-label">
                {browseScheduleOpen ? t("games.hideScheduleBrowser") : t("games.browseSchedule")}
              </span>
            </button>
            {isAdmin ? (
              <button
                className="schedule-browser-icon-button schedule-toolbar-button"
                type="button"
                onClick={handleScheduleOperationsToggle}
                aria-label={
                  scheduleOperationsOpen
                    ? t("games.hideScheduleOperations")
                    : t("games.showScheduleOperations")
                }
                aria-pressed={scheduleOperationsOpen}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 7h10M18 7h2M10 12h10M4 12h2M4 17h6M14 17h6M14 5v4M8 10v4M12 15v4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="schedule-toolbar-button-label">
                  {t("games.scheduleOperations")}
                </span>
              </button>
            ) : null}
          </div>
        }
      />

      {isAdmin && scheduleOperationsOpen && (
        <>
          <div>
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
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setImportModalMode("schedule");
                  setImportModalOpen(true);
                }}
              >
                {t("buttons.importCsv")}
              </button>
            </div>
          </SurfaceCard>
          </div>
        </>
      )}

      {browseScheduleOpen && (
        <div>
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
                <div
                  key={group.key}
                  ref={(node) => {
                    scheduleGroupRefs.current[group.key] = node;
                  }}
                  className="schedule-group-anchor"
                >
                  <SurfaceCard>
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
                              layout="schedule"
                              avatarSize="xl"
                              footer={
                                <div className="table-actions">
                                  <button
                                    className="button button-secondary button-small"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenGameDetails(game.id);
                                    }}
                                  >
                                    {t("games.detailsLink")}
                                  </button>
                                </div>
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
                                </div>

                                <div className="schedule-mobile-row-summary" />
                              </div>

                              <div className="schedule-mobile-row-footer">
                                <div className="schedule-mobile-admin-actions">
                                  <button
                                    className="button button-secondary button-small"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenGameDetails(game.id);
                                    }}
                                  >
                                    {t("games.detailsLink")}
                                  </button>
                                </div>
                              </div>
                            </article>
                            <button
                              className="schedule-mobile-row-overlay"
                              type="button"
                              aria-label={t("games.viewDetailsFor", {
                                awayTeamName: homeTeamName,
                                homeTeamName: awayTeamName,
                              })}
                              onClick={() => handleOpenGameDetails(game.id)}
                            >
                              <span className="visually-hidden">{t("buttons.viewDetails")}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </SurfaceCard>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {isAdmin && (
        <CsvImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          teams={teams}
          defaultMode={importModalMode}
          onSubmitSchedule={handleScheduleCsvImport}
          onSubmitRoster={handleRosterCsvImport}
        />
      )}

      {isAdmin && formOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <SurfaceCard className="modal-card">
            <SectionHeader
              title={t("games.modal.addTitle")}
              description={t("")}
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
            <form className="form-grid game-form-grid" onSubmit={handleCreateGame}>
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
                  value={getTeamSelectValue(formData, "away")}
                  onChange={(event) => handleFormTeamSelectChange("away", event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  <option value={CUSTOM_TEAM_VALUE}>{t("games.customTeamOption")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              {getTeamSelectValue(formData, "away") === CUSTOM_TEAM_VALUE ? (
                <label className="field">
                  <span>{t("games.customTeamOption")}</span>
                  <input
                    value={formData.away_team_name}
                    onChange={(event) => handleFormChange("away_team_name", event.target.value)}
                    placeholder={t("games.customTeamNamePlaceholder")}
                  />
                </label>
              ) : null}
              <label className="field">
                <span>{t("common.homeTeam")}</span>
                <select
                  value={getTeamSelectValue(formData, "home")}
                  onChange={(event) => handleFormTeamSelectChange("home", event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  <option value={CUSTOM_TEAM_VALUE}>{t("games.customTeamOption")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              {getTeamSelectValue(formData, "home") === CUSTOM_TEAM_VALUE ? (
                <label className="field">
                  <span>{t("games.customTeamOption")}</span>
                  <input
                    value={formData.home_team_name}
                    onChange={(event) => handleFormChange("home_team_name", event.target.value)}
                    placeholder={t("games.customTeamNamePlaceholder")}
                  />
                </label>
              ) : null}
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
            <form className="form-grid game-form-grid" onSubmit={handleEditSave}>
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
                  value={getTeamSelectValue(editData, "away")}
                  onChange={(event) => handleEditTeamSelectChange("away", event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  <option value={CUSTOM_TEAM_VALUE}>{t("games.customTeamOption")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              {getTeamSelectValue(editData, "away") === CUSTOM_TEAM_VALUE ? (
                <label className="field">
                  <span>{t("games.customTeamOption")}</span>
                  <input
                    value={editData.away_team_name}
                    onChange={(event) => handleEditChange("away_team_name", event.target.value)}
                    placeholder={t("games.customTeamNamePlaceholder")}
                  />
                </label>
              ) : null}
              <label className="field">
                <span>{t("common.homeTeam")}</span>
                <select
                  value={getTeamSelectValue(editData, "home")}
                  onChange={(event) => handleEditTeamSelectChange("home", event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  <option value={CUSTOM_TEAM_VALUE}>{t("games.customTeamOption")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              {getTeamSelectValue(editData, "home") === CUSTOM_TEAM_VALUE ? (
                <label className="field">
                  <span>{t("games.customTeamOption")}</span>
                  <input
                    value={editData.home_team_name}
                    onChange={(event) => handleEditChange("home_team_name", event.target.value)}
                    placeholder={t("games.customTeamNamePlaceholder")}
                  />
                </label>
              ) : null}
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
                  className="button button-danger"
                  type="button"
                  onClick={() => {
                    void handleDeleteFromEdit();
                  }}
                  disabled={editSaving || deletingId === editingGame.id}
                >
                  {deletingId === editingGame.id
                    ? t("common.deleteInProgress")
                    : t("games.modal.deleteGame")}
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

      {isAdmin && scoreGame && scoreModalTeams && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseRecordFinalScore();
            }
          }}
        >
          <SurfaceCard className="modal-card">
            <SectionHeader
              title={t("games.finalScore.title")}
              description={`${scoreModalTeams.homeTeamName} ${t("games.vs")} ${scoreModalTeams.awayTeamName}`}
              action={
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={handleCloseRecordFinalScore}
                  disabled={scoreSaving}
                >
                  {t("buttons.close")}
                </button>
              }
            />
            <form className="form-grid game-form-grid final-score-form" onSubmit={handleSaveFinalScore}>
              <label className="field final-score-team-field">
                <span>{scoreModalTeams.homeTeamName}</span>
                <small className="final-score-team-meta">{t("games.home")}</small>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={scoreData.home_score}
                  onChange={(event) => handleScoreChange("home_score", event.target.value)}
                />
              </label>
              <label className="field final-score-team-field">
                <span>{scoreModalTeams.awayTeamName}</span>
                <small className="final-score-team-meta">{t("games.away")}</small>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={scoreData.away_score}
                  onChange={(event) => handleScoreChange("away_score", event.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={scoreSaving}>
                  {scoreSaving ? t("common.saveInProgress") : t("games.finalScore.saveButton")}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleCloseRecordFinalScore}
                  disabled={scoreSaving}
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>
            {scoreError ? <Notice variant="error">{scoreError}</Notice> : null}
          </SurfaceCard>
        </div>
      )}

      {lineupGame && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseLineup();
            }
          }}
        >
          <SurfaceCard className="modal-card lineup-modal">
            <SectionHeader
              title={
                typeof lineupModalTitle === "string"
                  ? lineupModalTitle
                  : lineupModalTitle
                    ? `${lineupModalTitle.awayTeamName} ${t("games.vs")} ${lineupModalTitle.homeTeamName}`
                    : t("buttons.inputLineup")
              }
              description={`${formatFullGameDate(lineupGame)}${lineupState ? ` • ${t("games.minimumRequiredLabel", { count: lineupState.minimum_required_games })}` : ""}`}
              action={
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={handleCloseLineup}
                >
                  {t("buttons.close")}
                </button>
              }
            />

            {lineupLoading ? <LoadingState label={t("games.lineup.loading")} /> : null}
            {lineupError ? <Notice variant="error">{lineupError}</Notice> : null}

            {!lineupLoading && lineupState ? (
              <>
                <div className="lineup-selection-summary">
                  <strong>{t("games.lineup.selectedCount", { count: lineupSelectedIds.length })}</strong>
                  <span>{t("games.lineup.selectionHelp")}</span>
                </div>

                <div className="lineup-columns">
                  {lineupTeams.map((team) => (
                    <section className="lineup-team-panel" key={team.team_id}>
                      <div className="lineup-team-panel-header">
                        <h3>{team.team_name}</h3>
                        <span>
                          {t("games.lineup.rosterCount", { count: team.players.length })}
                        </span>
                      </div>
                      {team.players.length === 0 ? (
                        <p className="lineup-empty">{t("games.lineup.emptyRoster")}</p>
                      ) : (
                        <div className="lineup-player-list">
                          {team.players.map((player) => (
                            <label className="lineup-player-row" key={player.id}>
                              <input
                                type="checkbox"
                                checked={lineupSelectedSet.has(player.id)}
                                onChange={() => handleToggleLineupPlayer(player.id)}
                                disabled={lineupSaving}
                              />
                              <div className="lineup-player-copy">
                                <strong>
                                  {player.first_name} {player.last_name}
                                </strong>
                                <span className="lineup-player-meta">
                                  #{player.number ?? "-"} • {player.position ?? t("common.position")}
                                </span>
                              </div>
                              <span className="lineup-player-games">
                                {t("games.lineup.gamesPlayedSummary", {
                                  count: player.games_played ?? 0,
                                })}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>

                <div className="form-actions">
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void handleSaveLineup()}
                    disabled={lineupSaving}
                  >
                    {lineupSaving ? t("common.saveInProgress") : t("games.lineup.saveButton")}
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={handleCloseLineup}
                    disabled={lineupSaving}
                  >
                    {t("buttons.cancel")}
                  </button>
                </div>
              </>
            ) : null}
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
        headerActions={
          isAdmin && selectedGame ? (
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={handleEditFromDetails}
            >
              {t("games.modal.editGame")}
            </button>
          ) : null
        }
        footer={
          selectedGame && (canManageLineupForGame(selectedGame) || isAdmin) ? (
            <>
              {canManageLineupForGame(selectedGame) ? (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => {
                    handleCloseGameDetails();
                    handleOpenLineup(selectedGame);
                  }}
                >
                  {t("buttons.inputLineup")}
                </button>
              ) : null}
              {isAdmin ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    handleCloseGameDetails();
                    handleOpenRecordFinalScore(selectedGame);
                  }}
                >
                  {t("games.finalScore.openButton")}
                </button>
              ) : null}
            </>
          ) : null
        }
      />
    </section>
  );
}
