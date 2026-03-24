import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaFacebookF, FaYoutube } from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";
import { fetchGamesPublic, fetchTeamsPublic, getPosts, resolveApiUrl } from "../api";
import type { Game, Post, Team } from "../api";
import homeHeroImage from "../assets/Background.png";
import { PublicGameCard } from "../components/PublicGameCard";
import {
  EmptyState,
  LoadingState,
  Notice,
  SectionHeader,
  StatusChip,
  SurfaceCard,
  TeamAvatar,
} from "../components/ui";
import { leagueProfile } from "../utils/site";
import {
  buildTeamMap,
  formatDateTime,
  getRecentResults,
  getRecord,
  getUpcomingGames,
  sortStandings,
  truncate,
} from "../utils/league";

function HomeSocialIcon({ icon }: { icon: (typeof leagueProfile.socials)[number]["icon"] }) {
  if (icon === "facebook") {
    return <FaFacebookF aria-hidden="true" />;
  }

  return <FaYoutube aria-hidden="true" />;
}

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [teamsRes, gamesRes, postsRes] = await Promise.allSettled([
        fetchTeamsPublic(),
        fetchGamesPublic(),
        getPosts(),
      ]);

      if (!active) return;

      if (teamsRes.status === "fulfilled") setTeams(teamsRes.value);
      if (gamesRes.status === "fulfilled") setGames(gamesRes.value);
      if (postsRes.status === "fulfilled") setPosts(postsRes.value);

      if (
        teamsRes.status === "rejected" &&
        gamesRes.status === "rejected" &&
        postsRes.status === "rejected"
      ) {
        setError(t("home.loadError"));
      }

      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [t]);

  const teamMap = useMemo(() => buildTeamMap(teams), [teams]);
  const standings = useMemo(() => sortStandings(teams), [teams]);
  const standingsSnapshot = useMemo(() => standings.slice(0, 5), [standings]);
  const upcomingGames = useMemo(() => getUpcomingGames(games).slice(0, 3), [games]);
  const recentResults = useMemo(() => getRecentResults(games).slice(0, 4), [games]);
  const latestPosts = useMemo(() => posts.slice(0, 4), [posts]);

  const handleOpenGameDetails = (gameId: number) => {
    navigate("/games", { state: { selectedGameId: gameId } });
  };

  return (
    <section className="page-stack">
      <section className="home-hero-banner" aria-label={t("aria.leagueHeroImage")}>
        <img
          className="home-hero-banner-image"
          src={homeHeroImage}
          alt={t("home.heroImageAlt")}
        />
        <div className="home-hero-banner-overlay" />
        <div className="home-hero-banner-copy">
          <p className="home-hero-kicker">{t("home.welcomeTo")}</p>
          <div className="home-hero-title-group">
            <h1 className="home-hero-title" aria-label={leagueProfile.name}>
              <span className="home-hero-word home-hero-word-benito">
                <span className="home-hero-word-white">BEN</span>
                <span className="home-hero-word-outline">IT</span>
                <span className="home-hero-word-blue">O</span>
              </span>
              <span className="home-hero-word home-hero-word-juarez">
                <span className="home-hero-word-red">JUA</span>
                <span className="home-hero-word-outline-light">REZ</span>
              </span>
            </h1>
          </div>
          <div className="home-hero-meta">
            <span className="home-hero-meta-item home-hero-meta-item-primary">
              {t("home.heroMeta")}
            </span>
            <span className="home-hero-meta-item">{t("home.heroLocation")}</span>
            <span className="home-hero-meta-badge">{t("home.heroEstablished")}</span>
          </div>
          <SurfaceCard className="home-about-card" padded={false}>
            <div className="home-about-card-inner">
              <div className="home-about-card-copy">
                <p className="home-about-kicker">{t("home.about")}</p>
                <p>{t("home.aboutText")}</p>
              </div>

              <div className="home-about-socials" aria-label={t("aria.leagueSocialMedia")}>
                {leagueProfile.socials.map((social) => (
                  <a
                    key={social.label}
                    className="social-button social-button-footer"
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <HomeSocialIcon icon={social.icon} />
                    {social.label}
                  </a>
                ))}
              </div>
            </div>
          </SurfaceCard>
        </div>
      </section>

      {loading && <LoadingState label={t("home.loading")} />}
      {!loading && error && <Notice variant="error">{error}</Notice>}

      {!loading && !error && (
        <div className="home-layout">
          <div className="home-primary">
            <SurfaceCard>
              <div className="home-upcoming-header">
                <h2>{t("home.upcomingGames")}</h2>
                <Link className="button button-secondary button-small home-upcoming-action" to="/games">
                  {t("buttons.fullSchedule")}
                </Link>
              </div>
              {upcomingGames.length === 0 ? (
                <EmptyState
                  compact
                  title={t("home.noUpcomingTitle")}
                  description={t("home.noUpcomingDescription")}
                />
              ) : (
                <div className="matchup-list">
                  {upcomingGames.map((game) => {
                    const away = teamMap[game.away_team_id];
                    const home = teamMap[game.home_team_id];
                    const awayTeamName =
                      away?.name ?? t("common.teamFallback", { id: game.away_team_id });
                    const homeTeamName =
                      home?.name ?? t("common.teamFallback", { id: game.home_team_id });

                    return (
                      <div key={game.id} className="schedule-game-card-shell">
                        <PublicGameCard
                          className="schedule-game-card"
                          game={game}
                          awayTeamName={awayTeamName}
                          awayTeamLogoSrc={away?.logo_url ? resolveApiUrl(away.logo_url) : null}
                          homeTeamName={homeTeamName}
                          homeTeamLogoSrc={home?.logo_url ? resolveApiUrl(home.logo_url) : null}
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
              )}
            </SurfaceCard>

            <SurfaceCard>
              <SectionHeader
                title={t("home.recentResults")}
                description={t("")}
              />
              {recentResults.length === 0 ? (
                <EmptyState
                  compact
                  title={t("home.noResultsTitle")}
                  description={t("home.noResultsDescription")}
                />
              ) : (
                <div className="results-list">
                  {recentResults.map((game) => {
                    const away = teamMap[game.away_team_id];
                    const home = teamMap[game.home_team_id];
                    const awayTeamName =
                      away?.name ?? t("common.teamFallback", { id: game.away_team_id });
                    const homeTeamName =
                      home?.name ?? t("common.teamFallback", { id: game.home_team_id });

                    return (
                      <div key={game.id} className="schedule-game-card-shell">
                        <PublicGameCard
                          className="schedule-game-card"
                          game={game}
                          awayTeamName={awayTeamName}
                          awayTeamLogoSrc={away?.logo_url ? resolveApiUrl(away.logo_url) : null}
                          homeTeamName={homeTeamName}
                          homeTeamLogoSrc={home?.logo_url ? resolveApiUrl(home.logo_url) : null}
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
              )}
            </SurfaceCard>

            <SurfaceCard>
              <SectionHeader
                title={t("home.announcements")}
                description={t("")}
                action={
                  <Link className="button button-secondary button-small" to="/posts">
                    {t("buttons.allAnnouncements")}
                  </Link>
                }
              />
              {latestPosts.length === 0 ? (
                <EmptyState
                  compact
                  title={t("home.noAnnouncementsTitle")}
                  description={t("home.noAnnouncementsDescription")}
                />
              ) : (
                <div className="announcement-list">
                  {latestPosts.map((post) => (
                    <article className="announcement-card" key={post.id}>
                      <div className="announcement-header">
                        <div>
                          <p className="announcement-author">{post.author_name}</p>
                          <time className="announcement-time" dateTime={post.created_at}>
                            {formatDateTime(post.created_at)}
                          </time>
                        </div>
                        <StatusChip tone="accent">{t("home.announcementBadge")}</StatusChip>
                      </div>
                      <p className="announcement-content">{truncate(post.content, 220)}</p>
                      {post.image_url && (
                        <img
                          className="announcement-image"
                          src={resolveApiUrl(post.image_url)}
                          alt={t("common.announcementImageAlt")}
                          loading="lazy"
                        />
                      )}
                    </article>
                  ))}
                </div>
              )}
            </SurfaceCard>
          </div>

          <div className="home-secondary">
            <SurfaceCard className="standings-surface standings-surface-compact">
              <SectionHeader
                title={t("home.standingsSnapshot")}
                description=""
                action={
                  <Link className="button button-secondary button-small" to="/standings">
                    {t("buttons.fullStandings")}
                  </Link>
                }
              />
              {standings.length === 0 ? (
                <EmptyState
                  compact
                  title={t("home.noStandingsTitle")}
                  description={t("home.noStandingsDescription")}
                />
              ) : (
                <>
                  <div className="table-wrap standings-table-wrap">
                    <table className="league-table standings-table standings-table-compact compact-table">
                      <thead>
                        <tr>
                          <th>{t("common.rank")}</th>
                          <th>{t("common.team")}</th>
                          <th>{t("common.record")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standingsSnapshot.map((team, index) => (
                          <tr className="standings-row" key={team.id}>
                            <td className="standings-cell-rank" data-label={t("common.rank")}>
                              <span className="standings-rank">#{index + 1}</span>
                            </td>
                            <td className="standings-cell-team" data-label={t("common.team")}>
                              <div className="table-team">
                                <TeamAvatar
                                  name={team.name}
                                  src={team.logo_url ? resolveApiUrl(team.logo_url) : null}
                                  size="sm"
                                />
                                <span>{team.name}</span>
                              </div>
                            </td>
                            <td className="standings-cell-record" data-label={t("common.record")}>{getRecord(team)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ol className="standings-mobile-list" aria-label={t("aria.standingsSnapshot")}>
                    {standingsSnapshot.map((team, index) => {
                      const wins = team.wins ?? 0;
                      const losses = team.losses ?? 0;

                      return (
                        <li className="standings-mobile-item" key={team.id}>
                          <article className="standings-mobile-card">
                            <div className="standings-mobile-rank">
                              <span className="standings-rank">#{index + 1}</span>
                            </div>
                            <TeamAvatar
                              name={team.name}
                              src={team.logo_url ? resolveApiUrl(team.logo_url) : null}
                              size="sm"
                            />
                            <div className="standings-mobile-team">
                              <div className="standings-mobile-team-name">{team.name}</div>
                            </div>
                            <div className="standings-mobile-record">{getRecord(team)}</div>
                            <div className="standings-mobile-meta">
                              {t("home.standingsSummary", { wins, losses })}
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </SurfaceCard>

            <SurfaceCard>
              <SectionHeader title={t("home.quickLinks")} description="" />
              <div className="quick-links">
                <Link className="quick-link-card" to="/games">
                  <strong>{t("home.todayScheduleTitle")}</strong>
                  <span>{t("home.todayScheduleDescription")}</span>
                </Link>
                <Link className="quick-link-card" to="/teams">
                  <strong>{t("home.teamRostersTitle")}</strong>
                  <span>{t("home.teamRostersDescription")}</span>
                </Link>
                <Link className="quick-link-card" to="/posts">
                  <strong>{t("home.announcementsTitle")}</strong>
                  <span>{t("home.announcementsLinkDescription")}</span>
                </Link>
              </div>
            </SurfaceCard>


          </div>
        </div>
      )}
    </section>
  );
}
