import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import leagueLogo from "../assets/league-logo.png";
import "../styles/dashboard.css";

type DashboardLayoutProps = {
  authed: boolean;
  onLogout: () => void;
};

export default function DashboardLayout({ authed, onLogout }: DashboardLayoutProps) {
  const [open, setOpen] = useState(false);

  const closeDrawer = () => setOpen(false);

  return (
    <div className={`dashboard-shell ${open ? "drawer-open" : ""}`}>
      <header className="dashboard-header">
        <button
          className="menu-button menu-button-mobile"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <div className="header-brand">
          <img
            className="header-league-logo"
            src={leagueLogo}
            alt="Benito Juarez Men's Baseball League logo"
          />
          <div className="header-title">Benito Juarez Men&apos;s League</div>
        </div>
        <div className="header-actions">
          <nav className="header-nav" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link header-nav-link ${isActive ? "active" : ""}`}
            >
              Home
            </NavLink>
            <NavLink
              to="/games"
              className={({ isActive }) => `nav-link header-nav-link ${isActive ? "active" : ""}`}
            >
              Games
            </NavLink>
            <NavLink
              to="/teams"
              className={({ isActive }) => `nav-link header-nav-link ${isActive ? "active" : ""}`}
            >
              Teams
            </NavLink>
            <NavLink
              to="/posts"
              className={({ isActive }) => `nav-link header-nav-link ${isActive ? "active" : ""}`}
            >
              Posts
            </NavLink>
            {!authed && (
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `nav-link header-nav-link ${isActive ? "active" : ""}`
                }
              >
                Login
              </NavLink>
            )}
          </nav>
          {authed && (
            <button className="logout-button" onClick={onLogout}>
              Logout
            </button>
          )}
        </div>
      </header>

      <div className={`drawer-backdrop ${open ? "open" : ""}`} onClick={closeDrawer} />

      <aside className={`dashboard-drawer ${open ? "open" : ""}`}>
        <nav className="nav-list">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            onClick={closeDrawer}
          >
            Home
          </NavLink>
          <NavLink
            to="/games"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            onClick={closeDrawer}
          >
            Games
          </NavLink>
          <NavLink
            to="/teams"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            onClick={closeDrawer}
          >
            Teams
          </NavLink>
          <NavLink
            to="/posts"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            onClick={closeDrawer}
          >
            Posts
          </NavLink>
          {!authed && (
            <NavLink
              to="/login"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              onClick={closeDrawer}
            >
              Login
            </NavLink>
          )}
        </nav>
      </aside>

      <main className="dashboard-content">
        <Outlet />
      </main>
    </div>
  );
}
