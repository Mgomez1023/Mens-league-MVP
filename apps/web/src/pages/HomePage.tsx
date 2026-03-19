import { useEffect, useMemo, useState } from "react";
import { FaFacebookF, FaYoutube } from "react-icons/fa6";
import { Link } from "react-router-dom";
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
        setError("Unable to load the league dashboard right now.");
      }

      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const teamMap = useMemo(() => buildTeamMap(teams), [teams]);
  const standings = useMemo(() => sortStandings(teams), [teams]);
  const standingsSnapshot = useMemo(() => standings.slice(0, 5), [standings]);
  const upcomingGames = useMemo(() => getUpcomingGames(games).slice(0,3), [games]);
  const recentResults = useMemo(() => getRecentResults(games).slice(0, 4), [games]);
  const latestPosts = useMemo(() => posts.slice(0, 4), [posts]);

  return (
    <section className="page-stack">
      <section className="home-hero-banner" aria-label="League hero image">
        <img
          className="home-hero-banner-image"
          src={homeHeroImage}
          alt="Baseball players under stadium lights"
        />
        <div className="home-hero-banner-overlay" />
        <div className="home-hero-banner-copy">
          <p className="home-hero-kicker">WELCOME TO</p>
          <div className="home-hero-title-group">
            <h1 className="home-hero-title" aria-label="Benito Juarez Men's Baseball League">
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
              MEN&apos;S BASEBALL LEAGUE
            </span>
            <span className="home-hero-meta-item">CHICAGO.IL</span>
            <span className="home-hero-meta-badge">EST.1975</span>
          </div>
          <SurfaceCard className="home-about-card" padded={false}>
            <div className="home-about-card-inner">
              <div className="home-about-card-copy">
                <p className="home-about-kicker">About</p>
                <p>
                  Benito Juarez Men&apos;s League is a community baseball league built around
                  competitive weekend games, local teams, and a long-running Chicago baseball
                  tradition.
                </p>
              </div>

              <div className="home-about-socials" aria-label="League social media">
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

      {loading && <LoadingState label="Loading league dashboard..." />}
      {!loading && error && <Notice variant="error">{error}</Notice>}

      {!loading && !error && (
        <div className="home-layout">
          <div className="home-primary">
            <SurfaceCard>
              <SectionHeader
                title="Upcoming games"
                description=""
                action={
                  <Link className="button button-secondary button-small" to="/games">
                    Full schedule
                  </Link>
                }
              />
              {upcomingGames.length === 0 ? (
                <EmptyState
                  compact
                  title="No games scheduled yet"
                  description="Upcoming matchups will appear here as soon as the schedule is posted."
                />
              ) : (
                <div className="matchup-list">
                  {upcomingGames.map((game) => {
                    const away = teamMap[game.away_team_id];
                    const home = teamMap[game.home_team_id];
                    return (
                      <PublicGameCard
                        key={game.id}
                        className="home-game-card"
                        game={game}
                        awayTeamName={away?.name ?? `Team ${game.away_team_id}`}
                        awayTeamLogoSrc={away?.logo_url ? resolveApiUrl(away.logo_url) : null}
                        homeTeamName={home?.name ?? `Team ${game.home_team_id}`}
                        homeTeamLogoSrc={home?.logo_url ? resolveApiUrl(home.logo_url) : null}
                        showMetaDate
                        variant="featured"
                      />
                    );
                  })}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard>
              <SectionHeader
                title="Recent results"
                description="Latest final scores already entered into the league schedule."
              />
              {recentResults.length === 0 ? (
                <EmptyState
                  compact
                  title="No final scores yet"
                  description="Completed games will show here once results are posted."
                />
              ) : (
                <div className="results-list">
                  {recentResults.map((game) => {
                    const away = teamMap[game.away_team_id];
                    const home = teamMap[game.home_team_id];
                    return (
                      <PublicGameCard
                        key={game.id}
                        className="home-game-card"
                        game={game}
                        awayTeamName={away?.name ?? `Team ${game.away_team_id}`}
                        awayTeamLogoSrc={away?.logo_url ? resolveApiUrl(away.logo_url) : null}
                        homeTeamName={home?.name ?? `Team ${game.home_team_id}`}
                        homeTeamLogoSrc={home?.logo_url ? resolveApiUrl(home.logo_url) : null}
                        showMetaDate
                        variant="featured"
                      />
                    );
                  })}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard>
              <SectionHeader
                title="League announcements"
                description="Recent commissioner updates and public notices."
                action={
                  <Link className="button button-secondary button-small" to="/posts">
                    All announcements
                  </Link>
                }
              />
              {latestPosts.length === 0 ? (
                <EmptyState
                  compact
                  title="No announcements yet"
                  description="Public league updates will appear here."
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
                        <StatusChip tone="accent">Announcement</StatusChip>
                      </div>
                      <p className="announcement-content">{truncate(post.content, 220)}</p>
                      {post.image_url && (
                        <img
                          className="announcement-image"
                          src={resolveApiUrl(post.image_url)}
                          alt="League announcement"
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
            <SurfaceCard>
              <SectionHeader
                title="Standings snapshot"
                description=""
                action={
                  <Link className="button button-secondary button-small" to="/standings">
                    Full standings
                  </Link>
                }
              />
              {standings.length === 0 ? (
                <EmptyState
                  compact
                  title="No standings yet"
                  description="Team records will appear after final scores are entered."
                />
              ) : (
                <>
                  <div className="table-wrap standings-table-wrap">
                    <table className="league-table compact-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Team</th>
                          <th>Record</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standingsSnapshot.map((team, index) => (
                          <tr key={team.id}>
                            <td data-label="Rank">#{index + 1}</td>
                            <td data-label="Team">
                              <div className="table-team">
                                <TeamAvatar
                                  name={team.name}
                                  src={team.logo_url ? resolveApiUrl(team.logo_url) : null}
                                  size="sm"
                                />
                                <span>{team.name}</span>
                              </div>
                            </td>
                            <td data-label="Record">{getRecord(team)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ol className="standings-mobile-list" aria-label="Standings snapshot">
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
                              W {wins} • L {losses}
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
              <SectionHeader title="Quick links" description="" />
              <div className="quick-links">
                <Link className="quick-link-card" to="/games">
                  <strong>Today's schedule</strong>
                  <span>Check upcoming matchups and final scores.</span>
                </Link>
                <Link className="quick-link-card" to="/teams">
                  <strong>Team rosters</strong>
                  <span>Browse teams, records, and player lists.</span>
                </Link>
                <Link className="quick-link-card" to="/posts">
                  <strong>Announcements</strong>
                  <span>Read recent league updates and notices.</span>
                </Link>
              </div>
            </SurfaceCard>

            <SurfaceCard tone="subtle">
              <SectionHeader title="Season note" />
              <p className="season-note">
                This portal is designed for quick checks at the field: schedule first,
                standings second, announcements close at hand, and commissioner tools
                available without leaving the main workflow pages.
              </p>
            </SurfaceCard>
          </div>
        </div>
      )}
    </section>
  );
}
