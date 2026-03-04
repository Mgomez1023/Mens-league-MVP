import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  AuthError,
  PermissionError,
  createPlayer,
  deletePlayer,
  fetchTeams,
  fetchTeamsPublic,
  fetchRoster,
  fetchRosterPublic,
  importRosterCsv,
  resolveApiUrl,
  updatePlayer,
} from "../api";
import type { Player } from "../api";

type RosterPageProps = {
  authed: boolean;
  isAdmin: boolean;
  onAuthError: () => void;
};

export default function RosterPage({ authed, isAdmin, onAuthError }: RosterPageProps) {
  const { teamId } = useParams();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamLogo, setTeamLogo] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    number: "",
    position: "",
    bats: "",
    throws: "",
  });
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

      const id = Number(teamId);
      if (!teamId || Number.isNaN(id)) {
        setError("Invalid team selection.");
        setLoading(false);
        return;
      }

      try {
        const canAdmin = authed && isAdmin;
        const data = canAdmin ? await fetchRoster(id) : await fetchRosterPublic(id);
        if (!active) return;
        setPlayers(data);
        try {
          const teams = canAdmin ? await fetchTeams() : await fetchTeamsPublic();
          if (!active) return;
          const match = teams.find((team) => team.id === id);
          setTeamName(match?.name ?? null);
          setTeamLogo(match?.logo_url ?? null);
        } catch {
          // Non-blocking: roster still shows even if team name can't be resolved.
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof AuthError && authed && isAdmin) {
          onAuthError();
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setEndpointMissing(true);
          return;
        }
        setError("Unable to load roster right now.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [authed, isAdmin, onAuthError, teamId, refreshKey]);

  const openAddModal = () => {
    setEditingPlayer(null);
    setFormData({
      full_name: "",
      number: "",
      position: "",
      bats: "",
      throws: "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (player: Player) => {
    const fullName = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
    setEditingPlayer(player);
    setFormData({
      full_name: fullName,
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

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSavePlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!formData.full_name.trim()) {
      setFormError("Player name is required.");
      return;
    }

    const parts = formData.full_name.trim().split(/\s+/);
    const firstName = parts.shift() ?? "";
    const lastName = parts.length > 0 ? parts.join(" ") : "";

    if (!firstName || !lastName) {
      setFormError("Please provide both first and last name.");
      return;
    }

    const id = Number(teamId);
    if (!teamId || Number.isNaN(id)) {
      setFormError("Invalid team selection.");
      return;
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
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
          prev.map((player) => (player.id === updated.id ? updated : player)),
        );
      } else {
        const created = await createPlayer(id, payload);
        setPlayers((prev) =>
          [...prev, created].sort((a, b) => a.last_name.localeCompare(b.last_name)),
        );
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
      setFormError("Unable to save player right now.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlayer = async (playerId: number) => {
    if (!window.confirm("Delete this player?")) return;
    setDeletingId(playerId);
    try {
      await deletePlayer(playerId);
      setPlayers((prev) => prev.filter((player) => player.id !== playerId));
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
    const id = Number(teamId);
    if (!teamId || Number.isNaN(id)) {
      setError("Invalid team selection.");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importRosterCsv(id, file);
      setImportResult(result);
      setRefreshKey((prev) => prev + 1);
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
    <section>
      <div className="page-header roster-header">
        <div className="roster-left">
          <Link className="arrow-link" to="/teams" aria-label="Back to teams">
            ←
          </Link>
        </div>
        <div className="roster-title">
          <h1 className="roster-team-title">
            {teamName ? teamName : `Team ${teamId ?? ""}`}
          </h1>
          <p className="muted roster-subtitle">Roster</p>
        </div>
        <div className="roster-right">
          {teamLogo ? (
            <img
              className="roster-logo"
              src={resolveApiUrl(teamLogo)}
              alt={`${teamName ?? "Team"} logo`}
            />
          ) : (
            <div className="roster-logo fallback" aria-hidden="true">
              {teamName ? teamName.slice(0, 1).toUpperCase() : "T"}
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="roster-actions-row">
          <button className="ghost-link" type="button" onClick={openAddModal}>
            Add player
          </button>
          <label className="ghost-link import-label">
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
        </div>
      )}

      {isAdmin && importResult && (
        <div className="table-card roster-import">
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
        </div>
      )}

      {isAdmin && modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingPlayer ? "Edit player" : "Add player"}</h3>
              <button type="button" className="link-button" onClick={closeModal}>
                Close
              </button>
            </div>
            <form className="form-grid form-stacked" onSubmit={handleSavePlayer}>
              <label className="field">
                <span>Player Name</span>
                <input
                  className="centered-input"
                  value={formData.full_name}
                  onChange={(event) => handleFormChange("full_name", event.target.value)}
                  placeholder="First Last"
                />
              </label>
              <div className="compact-row">
                <label className="field compact-field compact-mini">
                  <span>Number</span>
                  <input
                    type="number"
                    min="0"
                    value={formData.number}
                    onChange={(event) => handleFormChange("number", event.target.value)}
                  />
                </label>
                <label className="field compact-field compact-mini">
                  <span>Position</span>
                  <input
                    value={formData.position}
                    onChange={(event) => handleFormChange("position", event.target.value)}
                  />
                </label>
              </div>
              <div className="compact-row">
                <label className="field compact-field">
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
                <label className="field compact-field">
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
              </div>
              <div className="form-actions form-actions-split centered">
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Saving..." : "Save player"}
                </button>
                <button type="button" className="ghost-link" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>
            {formError && <p className="status error">{formError}</p>}
          </div>
        </div>
      )}

      {loading && <p className="status">Loading roster...</p>}
      {!loading && endpointMissing && (
        <p className="status">Roster endpoint not available yet.</p>
      )}
      {!loading && error && <p className="status error">{error}</p>}

      {!loading && !endpointMissing && !error && (
        <div className="player-table">
          <div className={`player-row player-header ${isAdmin ? "with-actions" : ""}`}>
            <div>#</div>
            <div>Player</div>
            <div>Position</div>
            <div>Bats</div>
            <div>Throws</div>
            {isAdmin && <div>Actions</div>}
          </div>
          {players.map((player) => (
            <div
              className={`player-row ${isAdmin ? "with-actions" : ""}`}
              key={player.id}
            >
              <div className="player-cell" data-label="Number">
                {player.number ?? "—"}
              </div>
              <div className="player-cell" data-label="Player">
                {player.first_name} {player.last_name}
              </div>
              <div className="player-cell" data-label="Position">
                {player.position ?? "—"}
              </div>
              <div className="player-cell" data-label="Bats">
                {player.bats ?? "—"}
              </div>
              <div className="player-cell" data-label="Throws">
                {player.throws ?? "—"}
              </div>
              {isAdmin && (
                <div className="player-cell player-actions" data-label="Actions">
                  <button className="link-button" onClick={() => openEditModal(player)}>
                    Edit
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => handleDeletePlayer(player.id)}
                    disabled={deletingId === player.id}
                  >
                    {deletingId === player.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              )}
            </div>
          ))}

          {players.length === 0 && (
            <p className="status">No players listed yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
