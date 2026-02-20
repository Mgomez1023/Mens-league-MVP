import { useEffect, useState } from "react";
import { AuthError, clearToken, fetchTeams } from "../api";

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchTeams()
      .then(setTeams)
      .catch((error) => {
        if (error instanceof AuthError) {
          setErr("Not authorized (token missing/expired)");
          return;
        }
        setErr("Unable to load teams");
      });
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <h2>Admin Dashboard</h2>
        <button onClick={() => { clearToken(); onLogout(); }}>Logout</button>
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <h3>Teams</h3>
      <ul>
        {teams.map(t => 
        <li 
          style={{
            border: "2px solid white", 
            margin: "10px", 
            padding: "10px", 
            }} 
          key={t.id}>{t.name}
        </li>)}
      </ul>
    </div>
  );
}
