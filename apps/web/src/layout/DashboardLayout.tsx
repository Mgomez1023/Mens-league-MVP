import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaFacebookF, FaYoutube } from "react-icons/fa6";
import { NavLink, Outlet } from "react-router-dom";
import leagueLogo from "../assets/league-logo.png";
import LanguageToggle from "../components/LanguageToggle";
import { leagueProfile } from "../utils/site";
import "../styles/dashboard.css";

type DashboardLayoutProps = {
  authed: boolean;
  isAdmin: boolean;
  teamName: string | null;
  onLogout: () => void;
};

function SocialIcon({ icon }: { icon: (typeof leagueProfile.socials)[number]["icon"] }) {
  if (icon === "facebook") {
    return <FaFacebookF aria-hidden="true" />;
  }

  return <FaYoutube aria-hidden="true" />;
}

export default function DashboardLayout({
  authed,
  isAdmin,
  teamName,
  onLogout,
}: DashboardLayoutProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const adminPanelOpen = authed && isAdmin && adminMenuOpen;
  const publicLinks: Array<{ to: string; label: string; end?: boolean }> = [
    { to: "/games", label: t("nav.games") },
    { to: "/standings", label: t("nav.standings") },
    { to: "/teams", label: t("nav.teams") },
    { to: "/posts", label: t("nav.posts") },
    { to: "/rules", label: t("nav.rules") },
  ];
  const signedInLabel = authed
    ? isAdmin
      ? t("auth.signedInAsAdmin")
      : t("auth.signedInAsManager", {
          team: teamName || t("common.team"),
        })
    : null;

  const adminLinks = [
    { to: "/games", label: t("admin.manageGames") },
    { to: "/teams", label: t("admin.manageTeams") },
    { to: "/posts", label: t("admin.managePosts") },
  ];

  const closeDrawer = () => setOpen(false);
  const closeAdminMenu = () => setAdminMenuOpen(false);
  const closePanels = () => {
    closeDrawer();
    closeAdminMenu();
  };

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
        setOpen(false);
        setAdminMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open || adminPanelOpen) {
      setHeaderVisible(true);
      return;
    }

    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY;

      if (Math.abs(scrollDelta) < 8) {
        return;
      }

      if (currentScrollY < 72) {
        setHeaderVisible(true);
      } else if (scrollDelta > 0) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [adminPanelOpen, open]);

  return (
    <div className={`app-shell ${open ? "drawer-open" : ""}`}>
      <div
        className={`app-topbar ${headerVisible ? "app-topbar-visible" : "app-topbar-hidden"} ${
          open || adminPanelOpen ? "app-topbar-pinned" : ""
        }`}
      >
        <header className="app-header">
          <div className="app-header-inner">
            <div className="app-brand-row">
              <NavLink to="/" className="app-brand" onClick={closePanels}>
                <img
                  className="app-brand-logo"
                  src={leagueLogo}
                  alt={t("common.leagueLogoAlt")}
                />
                <div className="app-brand-copy">
                  <span className="app-brand-title">{leagueProfile.name}</span>
                </div>
              </NavLink>
            </div>

            <nav className="app-nav app-nav-desktop" aria-label={t("aria.primaryNavigation")}>
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
              <div className="header-actions-stack">
                <div className="header-language-toggle desktop-only">
                  <LanguageToggle />
                </div>
                <div className="header-socials" aria-label={t("aria.leagueSocialMedia")}>
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
              </div>
              <button
                className="menu-toggle"
                type="button"
                onClick={() => {
                  closeAdminMenu();
                  setOpen((prev) => !prev);
                }}
                aria-label={t("aria.toggleNavigation")}
              >
                {t("nav.menu")}
              </button>
            </div>
          </div>
        </header>

        {authed && (
          <div className="app-session-bar desktop-only">
            <div className="app-session-bar-inner">
              {signedInLabel ? <span className="session-indicator">{signedInLabel}</span> : null}
              {isAdmin && (
                <button
                  className="admin-menu-trigger"
                  type="button"
                  aria-expanded={adminPanelOpen}
                  aria-controls="admin-panel"
                  onClick={() => setAdminMenuOpen((prev) => !prev)}
                >
                  {t("admin.title")}
                </button>
              )}
              <button className="button button-secondary app-session-logout" type="button" onClick={onLogout}>
                {t("auth.logout")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={`admin-panel-backdrop ${adminPanelOpen ? "open" : ""}`} onClick={closeAdminMenu} />

      <aside className={`admin-panel ${adminPanelOpen ? "open" : ""}`} id="admin-panel" aria-hidden={!adminPanelOpen}>
        <div className="admin-panel-header">
          <div>
            <p className="admin-panel-kicker">{t("admin.commissioner")}</p>
            <h2>{t("admin.title")}</h2>
          </div>
          <button
            className="admin-panel-close"
            type="button"
            onClick={closeAdminMenu}
            aria-label={t("buttons.close")}
          >
            {t("buttons.close")}
          </button>
        </div>

        <nav className="admin-panel-nav" aria-label={t("aria.desktopAdmin")}>
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
            {t("auth.logout")}
          </button>
        </div>
      </aside>

      <div className={`drawer-backdrop ${open ? "open" : ""}`} onClick={closeDrawer} />

      <aside className={`app-drawer ${open ? "open" : ""}`}>
        
        <div className="drawer-section">
          <div className="app-brand-row">
            <NavLink to="/" className="app-brand" onClick={closePanels}>
              <img
                className="app-brand-logo"
                src={leagueLogo}
                alt={t("common.leagueLogoAlt")}
              />
              <div className="app-brand-copy">
                <span className="app-brand-title">{leagueProfile.name}</span>
              </div>
            </NavLink>
          </div>        
        </div>
        
        {signedInLabel ? (
          <div className="drawer-section">
            <p className="drawer-title">{t("auth.currentSession")}</p>
            <p className="drawer-session-indicator">{signedInLabel}</p>
          </div>
        ) : null}

        <div className="drawer-divider" aria-hidden="true" />

        <div className="drawer-section">
          <nav className="drawer-nav" aria-label={t("aria.mobilePrimary")}>
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
            <NavLink
              to="/contact"
              className={({ isActive }) => `drawer-link ${isActive ? "active" : ""}`}
              onClick={closeDrawer}
            >
              {t("nav.contact")}
            </NavLink>
            <NavLink
              to="/photos"
              className={({ isActive }) => `drawer-link ${isActive ? "active" : ""}`}
              onClick={closeDrawer}
            >
              {t("nav.photos")}
            </NavLink>
          </nav>
        </div>

        {isAdmin && (
          <div className="drawer-section">
            <p className="drawer-title">{t("admin.commissionerTools")}</p>
            <nav className="drawer-nav" aria-label={t("aria.mobileAdmin")}>
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

        <div className="drawer-divider" aria-hidden="true" />

        <div className="drawer-section">
          <p className="drawer-title">{t("language.switcherLabel")}</p>
          <LanguageToggle />
        </div>
        
        <div className="drawer-section">
          <div className="drawer-socials" aria-label={t("aria.mobileSocialMedia")}>
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
              {t("auth.logout")}
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
            <p className="footer-label">{t("footer.about")}</p>
            <p className="footer-heading">{leagueProfile.shortName}</p>
            <p className="footer-copy">{t("footer.aboutText")}</p>
          </div>

          <div className="footer-block footer-contact">
            <p className="footer-label">{t("footer.contact")}</p>
            <a className="footer-link" href={`mailto:${leagueProfile.email}`}>
              {leagueProfile.email}
            </a>
            <a className="footer-link" href={leagueProfile.phoneHref}>
              {leagueProfile.phone}
            </a>
            <p className="footer-copy">{t("footer.portalCopy")}</p>
          </div>

          <div className="footer-block footer-social">
            <p className="footer-label">{t("footer.follow")}</p>
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
            <p className="footer-label">{t("footer.admin")}</p>
            {authed ? (
              <>
                <button className="footer-admin-link" type="button" onClick={onLogout}>
                  {t("auth.logout")}
                </button>
                <p className="footer-copy">{t("footer.adminCopyAuthed")}</p>
              </>
            ) : (
              <>
                <NavLink to="/login" className="footer-admin-link" onClick={closePanels}>
                  {t("auth.login")}
                </NavLink>
                <p className="footer-copy">{t("footer.adminCopyGuest")}</p>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
