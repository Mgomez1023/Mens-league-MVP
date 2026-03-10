import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  AuthError,
  PermissionError,
  createTeam,
  deleteTeam,
  fetchTeams,
  fetchTeamsPublic,
  getCachedTeams,
  resolveApiUrl,
  uploadTeamLogo,
} from "../api";
import type { Team } from "../api";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  SectionHeader,
  SurfaceCard,
  TeamAvatar,
} from "../components/ui";
import { getRecord, sortStandings } from "../utils/league";

type TeamsPageProps = {
  authed: boolean;
  isAdmin: boolean;
  onAuthError: () => void;
};

const emptyForm = {
  name: "",
  home_field: "",
};

export default function TeamsPage({ authed, isAdmin, onAuthError }: TeamsPageProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formLogo, setFormLogo] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    const canAdmin = authed && isAdmin;

    const load = async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      setEndpointMissing(false);

      try {
        const data = canAdmin ? await fetchTeams() : await fetchTeamsPublic();
        if (!active) return;
        setTeams(sortStandings(data));
      } catch (err) {
        if (!active) return;
        if (err instanceof AuthError && canAdmin) {
          onAuthError();
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          const cached = getCachedTeams();
          if (cached && cached.length > 0) {
            setTeams(sortStandings(cached));
            setNotice("Showing cached teams while the live endpoint is unavailable.");
            return;
          }
          setEndpointMissing(true);
          return;
        }
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403) &&
          !canAdmin
        ) {
          const cached = getCachedTeams();
          if (cached && cached.length > 0) {
            setTeams(sortStandings(cached));
            setNotice("Showing cached teams. Log in for the latest league data.");
            return;
          }
          setError("Teams are temporarily unavailable.");
          return;
        }
        setError("Unable to load teams right now.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [authed, isAdmin, onAuthError]);

  const orderedTeams = useMemo(() => sortStandings(teams), [teams]);

  const handleFormChange = (field: keyof typeof emptyForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    if (!formData.name.trim()) {
      setFormError("Team name is required.");
      return;
    }

    setSaving(true);
    try {
      const created = await createTeam({
        name: formData.name.trim(),
        home_field: formData.home_field.trim() || null,
      });

      let updatedTeam = created;
      if (formLogo) {
        setUploading(true);
        try {
          const result = await uploadTeamLogo(created.id, formLogo);
          updatedTeam = { ...created, logo_url: result.logo_url };
        } catch (err) {
          if (err instanceof AuthError) {
            onAuthError();
            return;
          }
          if (err instanceof PermissionError) {
            setFormError("Admin access required.");
            return;
          }
          setFormError("Team saved, but the logo upload failed.");
        }
      }

      setTeams((prev) => sortStandings([...prev.filter((team) => team.id !== updatedTeam.id), updatedTeam]));
      setFormData(emptyForm);
      setFormLogo(null);
      setFormOpen(false);
      setNotice("Team added successfully.");
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
      setFormError("Unable to add team right now.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    if (!window.confirm("Delete this team?")) return;
    setDeletingId(teamId);
    setError(null);
    setNotice(null);
    try {
      await deleteTeam(teamId);
      setTeams((prev) => prev.filter((team) => team.id !== teamId));
      setNotice("Team removed.");
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      if (err instanceof PermissionError) {
        setError("Admin access required.");
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        const detail = err.detail ?? err.message;
        const confirmed = window.confirm(
          `${detail} Delete anyway? This will also remove related games and players.`,
        );
        if (!confirmed) return;
        try {
          await deleteTeam(teamId, { force: true });
          setTeams((prev) => prev.filter((team) => team.id !== teamId));
          setNotice("Team and related data removed.");
          return;
        } catch (inner) {
          if (inner instanceof AuthError) {
            onAuthError();
            return;
          }
          if (inner instanceof PermissionError) {
            setError("Admin access required.");
            return;
          }
          setError("Unable to delete team right now.");
          return;
        }
      }
      setError("Unable to delete team right now.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogoSelect = (file?: File | null) => {
    if (!file) {
      setFormLogo(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setFormError("Please upload a valid image file.");
      return;
    }
    setFormError(null);
    setFormLogo(file);
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Teams and rosters"
        title="League teams"
        description=""
        actions={
          isAdmin ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => setFormOpen((prev) => !prev)}
            >
              {formOpen ? "Close form" : "Add team"}
            </button>
          ) : undefined
        }
      />

      {loading && <LoadingState label="Loading teams..." />}
      {!loading && endpointMissing && (
        <Notice variant="warning">Teams endpoint not available yet.</Notice>
      )}
      {!loading && notice && <Notice variant="success">{notice}</Notice>}
      {!loading && error && <Notice variant="error">{error}</Notice>}

      {!loading && !error && !endpointMissing && (
        <SurfaceCard>
          <SectionHeader
            title="All teams"
            description=""
          />
          {orderedTeams.length === 0 ? (
            <EmptyState
              title="No teams found"
              description="Add a team to start building the league table and roster pages."
            />
          ) : (
            <div className="team-grid">
              {orderedTeams.map((team, index) => (
                <article className="team-overview-card" key={team.id}>
                  <div className="team-overview-head">
                    <div className="team-overview-brand">
                      <TeamAvatar
                        name={team.name}
                        src={team.logo_url ? resolveApiUrl(team.logo_url) : null}
                        size="lg"
                      />
                      <div className="team-overview-copy">
                        <div className="team-overview-title-row">
                          <h3>{team.name}</h3>
                          <div className="team-record-badge">{getRecord(team)}</div>
                        </div>
                        <p className="team-rank">Rank #{index + 1}</p>
                      </div>
                    </div>
                  </div>

                  <div className="team-card-actions">
                    <Link className="button button-secondary button-small" to={`/teams/${team.id}/roster`}>
                      View roster
                    </Link>
                    {isAdmin && (
                      <button
                        className="button button-danger button-small"
                        onClick={() => handleDeleteTeam(team.id)}
                        disabled={deletingId === team.id}
                      >
                        {deletingId === team.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </SurfaceCard>
      )}

      {isAdmin && formOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <SurfaceCard className="modal-card">
            <SectionHeader
              title="Add team"
              description="Create a new club entry and optionally attach a logo."
              action={
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setFormError(null);
                  }}
                >
                  Close
                </button>
              }
            />
            <form className="form-grid team-form-grid" onSubmit={handleCreateTeam}>
              <label className="field">
                <span>Team name</span>
                <input
                  value={formData.name}
                  onChange={(event) => handleFormChange("name", event.target.value)}
                  placeholder="e.g. Cubs"
                />
              </label>

              <label className="field">
                <span>Home field</span>
                <input
                  value={formData.home_field}
                  onChange={(event) => handleFormChange("home_field", event.target.value)}
                  placeholder="e.g. Benito Juarez Field 1"
                />
              </label>

              <label className="field">
                <span>Team logo</span>
                <label className="file-trigger">
                  <span>{formLogo ? formLogo.name : "Choose image"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleLogoSelect(event.target.files?.[0])}
                  />
                </label>
              </label>

              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={saving || uploading}>
                  {saving || uploading ? "Saving..." : "Save team"}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setFormError(null);
                  }}
                >
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
