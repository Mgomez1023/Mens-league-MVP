import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage.tsx";
import DashboardLayout from "./layout/DashboardLayout";
import HomePage from "./pages/HomePage";
import TeamsPage from "./pages/TeamsPage";
import GamesPage from "./pages/GamesPage";
import RosterPage from "./pages/RosterPage";
import PostsPage from "./pages/PostsPage";
import StandingsPage from "./pages/StandingsPage";
import RulesPage from "./pages/RulesPage";
import { clearToken, getRoleClaim, getTokenClaims, isAdminClaim, onUnauthorized, getToken } from "./api";
import type { UserRole } from "./api";

type AuthState = {
  authed: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  teamId: number | null;
  teamName: string | null;
  email: string | null;
};

function readAuthState(): AuthState {
  const token = getToken();
  if (!token) {
    return { authed: false, role: null, isAdmin: false, teamId: null, teamName: null, email: null };
  }
  const claims = getTokenClaims(token);
  if (!claims) {
    clearToken();
    return { authed: false, role: null, isAdmin: false, teamId: null, teamName: null, email: null };
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims?.exp && claims.exp < now) {
    clearToken();
    return { authed: false, role: null, isAdmin: false, teamId: null, teamName: null, email: null };
  }
  return {
    authed: true,
    role: getRoleClaim(claims),
    isAdmin: isAdminClaim(claims),
    teamId: claims.team_id ?? null,
    teamName: claims.team_name ?? null,
    email: claims.email ?? null,
  };
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>(() => readAuthState());
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    setAuth({ authed: false, role: null, isAdmin: false, teamId: null, teamName: null, email: null });
    navigate("/", { replace: true });
  };

  const handleAuthError = () => {
    clearToken();
    setAuth({ authed: false, role: null, isAdmin: false, teamId: null, teamName: null, email: null });
    navigate("/", { replace: true });
  };

  const handleLoginDone = () => {
    setAuth(readAuthState());
    navigate("/", { replace: true });
  };

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setAuth({ authed: false, role: null, isAdmin: false, teamId: null, teamName: null, email: null });
      navigate("/", { replace: true });
    });
    return unsubscribe;
  }, [navigate]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <DashboardLayout
            authed={auth.authed}
            isAdmin={auth.isAdmin}
            teamName={auth.teamName}
            onLogout={handleLogout}
          />
        }
      >
        <Route index element={<HomePage />} />
        <Route path="standings" element={<StandingsPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route
          path="teams"
          element={
            <TeamsPage
              authed={auth.authed}
              isAdmin={auth.isAdmin}
              teamId={auth.teamId}
              onAuthError={handleAuthError}
            />
          }
        />
        <Route
          path="login"
          element={
            auth.authed ? (
              <Navigate to="/" replace />
            ) : (
              <LandingPage onDone={handleLoginDone} />
            )
          }
        />
        <Route
          path="games"
          element={
            <GamesPage
              authed={auth.authed}
              isAdmin={auth.isAdmin}
              role={auth.role}
              managerTeamId={auth.teamId}
              onAuthError={handleAuthError}
            />
          }
        />
        <Route
          path="posts"
          element={<PostsPage isAdmin={auth.isAdmin} onAuthError={handleAuthError} />}
        />
        <Route
          path="teams/:teamId/roster"
          element={
            <RosterPage
              authed={auth.authed}
              isAdmin={auth.isAdmin}
              managerTeamId={auth.teamId}
              onAuthError={handleAuthError}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
 
