import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage.tsx";
import DashboardLayout from "./layout/DashboardLayout";
import TeamsPage from "./pages/TeamsPage";
import GamesPage from "./pages/GamesPage";
import RosterPage from "./pages/RosterPage";
import { clearToken, getTokenClaims, isAdminClaim, onUnauthorized, getToken } from "./api";

type AuthState = {
  authed: boolean;
  isAdmin: boolean;
};

function readAuthState(): AuthState {
  const token = getToken();
  if (!token) return { authed: false, isAdmin: false };
  const claims = getTokenClaims(token);
  if (!claims) {
    clearToken();
    return { authed: false, isAdmin: false };
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims?.exp && claims.exp < now) {
    clearToken();
    return { authed: false, isAdmin: false };
  }
  return { authed: true, isAdmin: isAdminClaim(claims) };
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>(() => readAuthState());
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    setAuth({ authed: false, isAdmin: false });
    navigate("/games", { replace: true });
  };

  const handleAuthError = () => {
    clearToken();
    setAuth({ authed: false, isAdmin: false });
    navigate("/games", { replace: true });
  };

  const handleLoginDone = () => {
    setAuth(readAuthState());
    navigate("/games", { replace: true });
  };

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setAuth({ authed: false, isAdmin: false });
      navigate("/games", { replace: true });
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
            onLogout={handleLogout}
          />
        }
      >
        <Route index element={<Navigate to="/games" replace />} />
        <Route
          path="teams"
          element={
            <TeamsPage authed={auth.authed} isAdmin={auth.isAdmin} onAuthError={handleAuthError} />
          }
        />
        <Route
          path="login"
          element={
            auth.authed ? (
              <Navigate to="/games" replace />
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
              onAuthError={handleAuthError}
            />
          }
        />
        <Route
          path="teams/:teamId/roster"
          element={
            <RosterPage authed={auth.authed} isAdmin={auth.isAdmin} onAuthError={handleAuthError} />
          }
        />
        <Route path="*" element={<Navigate to="/games" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/games" replace />} />
    </Routes>
  );
}
 
