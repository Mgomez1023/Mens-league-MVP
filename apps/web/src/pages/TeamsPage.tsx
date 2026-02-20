import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  AuthError,
  createTeam,
  deleteTeam,
  fetchTeams,
  fetchTeamsPublic,
  getCachedTeams,
  resolveApiUrl,
  uploadTeamLogo,
  PermissionError,
} from "../api";
import type { Team } from "../api";

type TeamsPageProps = {
  authed: boolean;
  isAdmin: boolean;
  onAuthError: () => void;
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
  const [logoShapes, setLogoShapes] = useState<Record<number, "square" | "wide" | "tall">>({});
  const [formData, setFormData] = useState({
    name: "",
  });
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
        setTeams(data);
      } catch (err) {
        if (!active) return;
        if (err instanceof AuthError && canAdmin) {
          onAuthError();
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          const cached = getCachedTeams();
          if (cached && cached.length > 0) {
            setTeams(cached);
            setNotice("Showing cached teams. Log in for the latest data.");
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
            setTeams(cached);
            setNotice("Showing cached teams. Log in for the latest data.");
            return;
          }
          setError("Teams are temporarily unavailable without login.");
          return;
        }
        setError("Unable to load teams right now.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [authed, isAdmin, onAuthError]);

  const handleFormChange = (value: string) => {
    setFormData({ name: value });
  };

  const handleCreateTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError("Team name is required.");
      return;
    }

    setSaving(true);
    try {
      const created = await createTeam({
        name: formData.name.trim(),
      });
      setTeams((prev) =>
        [...prev.filter((team) => team.id !== created.id), created].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
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
          setFormError("Logo upload failed. Team was created without a logo.");
        }
      }
      setTeams((prev) =>
        [...prev.filter((team) => team.id !== updatedTeam.id), updatedTeam].sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      );
      setFormData({ name: "" });
      setFormLogo(null);
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
      setFormError("Unable to add team right now.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    if (!window.confirm("Delete this team?")) return;
    setDeletingId(teamId);
    try {
      await deleteTeam(teamId);
      setTeams((prev) => prev.filter((team) => team.id !== teamId));
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
          `${detail} Delete anyway? This will remove related games and players.`,
        );
        if (!confirmed) return;
        try {
          await deleteTeam(teamId, { force: true });
          setTeams((prev) => prev.filter((team) => team.id !== teamId));
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

  const handleLogoLoad = (teamId: number, image: HTMLImageElement) => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const ratio = image.naturalWidth / image.naturalHeight;
    let shape: "square" | "wide" | "tall" = "square";
    if (ratio >= 1.2) shape = "wide";
    else if (ratio <= 0.83) shape = "tall";
    setLogoShapes((prev) => (prev[teamId] === shape ? prev : { ...prev, [teamId]: shape }));
  };

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Teams</h1>
          <p className="muted">
            {isAdmin
              ? "Manage teams and view rosters."
              : "Browse teams in read-only mode. Log in to view rosters."}
          </p>
        </div>
        {isAdmin && (
          <button
            className="ghost-link"
            type="button"
            onClick={() => setFormOpen((prev) => !prev)}
          >
            {formOpen ? "Close" : "Add team"}
          </button>
        )}
      </div>

      {isAdmin && formOpen && (
        <div className="table-card form-card">
          <form className="form-grid" onSubmit={handleCreateTeam}>
            <label className="field">
              <span>Team Name</span>
              <input
                value={formData.name}
                onChange={(event) => handleFormChange(event.target.value)}
                placeholder="e.g. Cubs"
              />
            </label>
            <label className="field">
              <span>Team Logo</span>
              <label className="upload-button">
                {formLogo ? formLogo.name : "Choose image"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleLogoSelect(event.target.files?.[0])}
                />
              </label>
            </label>
            <div className="form-actions form-actions-split">
              <button type="submit" disabled={saving || uploading}>
                {saving || uploading ? "Saving..." : "Save team"}
              </button>
              <button
                type="button"
                className="ghost-link"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
          {formError && <p className="status error">{formError}</p>}
        </div>
      )}

      {loading && <p className="status">Loading teams...</p>}
      {!loading && endpointMissing && (
        <p className="status">Teams endpoint not available yet.</p>
      )}
      {!loading && notice && <p className="status">{notice}</p>}
      {!loading && error && <p className="status error">{error}</p>}

      {!loading && !error && !endpointMissing && (
        <div className="teams-grid">
          {teams.map((team) => (
            <div className="team-card" key={team.id}>
              <div className={`team-logo ${logoShapes[team.id] ?? "square"}`}>
                {team.logo_url ? (
                  <img
                    src={resolveApiUrl(team.logo_url)}
                    alt={`${team.name} logo`}
                    onLoad={(event) => handleLogoLoad(team.id, event.currentTarget)}
                  />
                ) : (
                  <span aria-hidden="true">{team.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="team-name">{team.name}</div>
              <div className="team-record">
                Record {team.wins ?? 0}-{team.losses ?? 0}
              </div>
              <div className="team-actions">
                <Link className="table-link" to={`/teams/${team.id}/roster`}>
                  View roster
                </Link>
                {isAdmin && (
                  <button
                    className="danger-button"
                    onClick={() => handleDeleteTeam(team.id)}
                    disabled={deletingId === team.id}
                  >
                    {deletingId === team.id ? "Deleting..." : "Delete"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {teams.length === 0 && (
            <p className="status">No teams found yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
