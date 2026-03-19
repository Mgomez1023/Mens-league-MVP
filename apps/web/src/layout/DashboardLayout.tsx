import { useEffect, useState } from "react";
import { FaFacebookF, FaYoutube } from "react-icons/fa6";
import { NavLink, Outlet } from "react-router-dom";
import leagueLogo from "../assets/league-logo.png";
import { leagueProfile } from "../utils/site";
import "../styles/dashboard.css";

type DashboardLayoutProps = {
  authed: boolean;
  isAdmin: boolean;
  onLogout: () => void;
};

const publicLinks = [
  { to: "/", label: "Home", end: true },
  { to: "/games", label: "Schedule" },
  { to: "/standings", label: "Standings" },
  { to: "/teams", label: "Teams" },
  { to: "/posts", label: "Announcements" },
];

const adminLinks = [
  { to: "/games", label: "Manage Games" },
  { to: "/teams", label: "Manage Teams" },
  { to: "/posts", label: "Manage Posts" },
];

function SocialIcon({ icon }: { icon: (typeof leagueProfile.socials)[number]["icon"] }) {
  if (icon === "facebook") {
    return <FaFacebookF aria-hidden="true" />;
  }

  return <FaYoutube aria-hidden="true" />;
}

export default function DashboardLayout({ authed, isAdmin, onLogout }: DashboardLayoutProps) {
  const [open, setOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  const closeDrawer = () => setOpen(false);
  const closeAdminMenu = () => setAdminMenuOpen(false);
  const closePanels = () => {
    closeDrawer();
    closeAdminMenu();
  };

  useEffect(() => {
    if (!authed || !isAdmin) {
      setAdminMenuOpen(false);
    }
  }, [authed, isAdmin]);

  useEffect(() => {
    const shouldLockScroll = open;
    const previousOverflow = document.body.style.overflow;

    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanels();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={`app-shell ${open ? "drawer-open" : ""}`}>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand-row">
            <NavLink to="/" className="app-brand" onClick={closePanels}>
              <img
                className="app-brand-logo"
                src={leagueLogo}
                alt="Benito Juarez Men's Baseball League logo"
              />
              <div className="app-brand-copy">
                <span className="app-brand-title">Benito Juarez Men&apos;s Baseball League</span>
              </div>
            </NavLink>
          </div>

          <nav className="app-nav app-nav-desktop" aria-label="Primary">
            {publicLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="app-header-actions">
            <div className="header-socials" aria-label="League social media">
              {leagueProfile.socials.map((social) => (
                <a
                  key={social.label}
                  className="social-button social-button-header"
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                  title={social.label}
                >
                  <SocialIcon icon={social.icon} />
                </a>
              ))}
            </div>
            <button
              className="menu-toggle"
              type="button"
              onClick={() => {
                closeAdminMenu();
                setOpen((prev) => !prev);
              }}
              aria-label="Toggle navigation"
            >
              Menu
            </button>
            {isAdmin && (
              <button
                className="admin-menu-trigger desktop-only"
                type="button"
                aria-expanded={adminMenuOpen}
                aria-controls="admin-panel"
                onClick={() => setAdminMenuOpen((prev) => !prev)}
              >
                Admin Tools
              </button>
            )}

          </div>
        </div>
      </header>

      <div className={`admin-panel-backdrop ${adminMenuOpen ? "open" : ""}`} onClick={closeAdminMenu} />

      <aside className={`admin-panel ${adminMenuOpen ? "open" : ""}`} id="admin-panel" aria-hidden={!adminMenuOpen}>
        <div className="admin-panel-header">
          <div>
            <p className="admin-panel-kicker">Commissioner</p>
            <h2>Admin Tools</h2>
          </div>
          <button className="admin-panel-close" type="button" onClick={closeAdminMenu} aria-label="Close admin tools">
            Close
          </button>
        </div>

        <nav className="admin-panel-nav" aria-label="Desktop admin">
          {adminLinks.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={({ isActive }) => `admin-panel-link ${isActive ? "active" : ""}`}
              onClick={closeAdminMenu}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-panel-footer">
          <button
            className="button button-secondary admin-panel-logout"
            onClick={() => {
              closeAdminMenu();
              onLogout();
            }}
          >
            Log Out
          </button>
        </div>
      </aside>

      <div className={`drawer-backdrop ${open ? "open" : ""}`} onClick={closeDrawer} />

      <aside className={`app-drawer ${open ? "open" : ""}`}>
        <div className="drawer-section">
          <nav className="drawer-nav" aria-label="Mobile primary">
            {publicLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `drawer-link ${isActive ? "active" : ""}`}
                onClick={closeDrawer}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {isAdmin && (
          <div className="drawer-section">
            <p className="drawer-title">Commissioner tools</p>
            <nav className="drawer-nav" aria-label="Mobile admin">
              {adminLinks.map((link) => (
                <NavLink
                  key={link.label}
                  to={link.to}
                  className={({ isActive }) => `drawer-link ${isActive ? "active" : ""}`}
                  onClick={closeDrawer}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}

        <div className="drawer-section">
          <div className="drawer-socials" aria-label="Mobile social media">
            {leagueProfile.socials.map((social) => (
              <a
                key={social.label}
                className="social-button social-button-drawer"
                href={social.href}
                target="_blank"
                rel="noreferrer"
              >
                <SocialIcon icon={social.icon} />
                {social.label}
              </a>
            ))}
          </div>
        </div>

        {authed && (
          <div className="drawer-section">
            <button
              className="button button-secondary drawer-button"
              onClick={() => {
                closeDrawer();
                onLogout();
              }}
            >
              Log Out
            </button>
          </div>
        )}
      </aside>

      <main className="app-main">
        <div className="app-main-inner">
          <Outlet />
        </div>
      </main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <div className="footer-block footer-about">
            <p className="footer-label">About</p>
            <p className="footer-heading">{leagueProfile.shortName}</p>
            <p className="footer-copy">{leagueProfile.about}</p>
          </div>

          <div className="footer-block footer-contact">
            <p className="footer-label">Contact</p>
            <a className="footer-link" href={`mailto:${leagueProfile.email}`}>
              {leagueProfile.email}
            </a>
            <p className="footer-copy">Schedule, standings, rosters, and league announcements in one place.</p>
          </div>

          <div className="footer-block footer-social">
            <p className="footer-label">Follow</p>
            <div className="footer-socials">
              {leagueProfile.socials.map((social) => (
                <a
                  key={social.label}
                  className="social-button social-button-footer"
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <SocialIcon icon={social.icon} />
                  {social.label}
                </a>
              ))}
            </div>
          </div>

          <div className="footer-block footer-admin">
            <p className="footer-label">Admin</p>
            {authed ? (
              <>
                <button className="footer-admin-link" type="button" onClick={onLogout}>
                  Log Out
                </button>
                <p className="footer-copy">Commissioner access is intentionally kept low-profile.</p>
              </>
            ) : (
              <>
                <NavLink to="/login" className="footer-admin-link" onClick={closePanels}>
                  Admin Login
                </NavLink>
                <p className="footer-copy">Commissioner tools and posting access.</p>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
