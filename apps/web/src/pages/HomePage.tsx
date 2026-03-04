import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchGamesPublic,
  fetchTeamsPublic,
  getPosts,
  resolveApiUrl,
} from "../api";
import type { Game, Post, Team } from "../api";

function parseDateOnly(value: string) {
  if (!value) return null;
  const datePart = value.includes("T") ? value.split("T")[0] : value.split(" ")[0];
  const date = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "Time TBD";
  const trimmed = value.trim();
  if (!trimmed) return "Time TBD";
  const parts = trimmed.split(":");
  if (parts.length < 2) return trimmed;
  const hour = Number(parts[0]);
  const minute = Number(parts[1].slice(0, 2));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return trimmed;
  const temp = new Date();
  temp.setHours(hour, minute, 0, 0);
  return temp.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncate(value: string, max = 170) {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
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
        setError("Unable to load league dashboard right now.");
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const teamMap = useMemo(() => {
    const map: Record<number, Team> = {};
    teams.forEach((team) => {
      map[team.id] = team;
    });
    return map;
  }, [teams]);

  const recentPosts = useMemo(() => posts.slice(0, 4), [posts]);

  const nextWeekGames = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = games
      .map((game) => ({ game, date: parseDateOnly(game.date) }))
      .filter((entry) => entry.date && entry.date >= today) as Array<{ game: Game; date: Date }>;

    if (upcoming.length === 0) return [];

    upcoming.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      if (diff !== 0) return diff;
      return a.game.id - b.game.id;
    });

    const windowStart = upcoming[0].date;
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 7);

    return upcoming
      .filter((entry) => entry.date <= windowEnd)
      .map((entry) => entry.game)
      .sort((a, b) => {
        const dateDiff = a.date.localeCompare(b.date);
        if (dateDiff !== 0) return dateDiff;
        return (a.time ?? "").localeCompare(b.time ?? "");
      });
  }, [games]);

  const visibleNextWeekGames = useMemo(() => nextWeekGames.slice(0, 4), [nextWeekGames]);

  const standings = useMemo(() => {
    return [...teams].sort((a, b) => {
      const winsDiff = (b.wins ?? 0) - (a.wins ?? 0);
      if (winsDiff !== 0) return winsDiff;
      const lossesDiff = (a.losses ?? 0) - (b.losses ?? 0);
      if (lossesDiff !== 0) return lossesDiff;
      return a.name.localeCompare(b.name);
    });
  }, [teams]);

  return (
    <section className="home-page">
      <div className="home-hero">
        <h1>Benito Juarez Men&apos;s League</h1>
      </div>

      {loading && <p className="status">Loading league dashboard...</p>}
      {!loading && error && <p className="status error">{error}</p>}

      {!loading && (
        <>
          <div className="home-grid">
            <article className="home-panel">
              <div className="panel-head">
                <h2>Latest Posts</h2>
                <Link className="table-link" to="/posts">
                  View all
                </Link>
              </div>
              {recentPosts.length === 0 && <p className="status">No posts yet.</p>}
              {recentPosts.length > 0 && (
                <div className="home-post-list">
                  {recentPosts.map((post) => (
                    <article key={post.id} className="home-post-item">
                      <div className="home-post-meta">
                        <span className="home-post-author">{post.author_name}</span>
                        <time dateTime={post.created_at}>{formatDateTime(post.created_at)}</time>
                      </div>
                      <p>{truncate(post.content)}</p>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="home-panel">
              <div className="panel-head">
                <h2>Next Week Games</h2>
              </div>
              {visibleNextWeekGames.length === 0 && (
                <p className="status">No upcoming games scheduled.</p>
              )}
              {visibleNextWeekGames.length > 0 && (
                <div className="home-game-list">
                  {visibleNextWeekGames.map((game) => {
                    const home = teamMap[game.home_team_id]?.name ?? `Team ${game.home_team_id}`;
                    const away = teamMap[game.away_team_id]?.name ?? `Team ${game.away_team_id}`;
                    const homeLogo = teamMap[game.home_team_id]?.logo_url;
                    const awayLogo = teamMap[game.away_team_id]?.logo_url;
                    return (
                      <div className="home-game-item" key={game.id}>
                        <div className="home-game-head">
                          <span>{formatDate(game.date)}</span>
                          <span>{formatTime(game.time)}</span>
                        </div>
                        <div className="home-game-teams">
                          <div className="home-game-team">
                            {awayLogo ? (
                              <img src={resolveApiUrl(awayLogo)} alt={`${away} logo`} />
                            ) : (
                              <div className="home-game-fallback">{away.charAt(0)}</div>
                            )}
                            <span>{away}</span>
                          </div>
                          <span className="home-game-vs">vs</span>
                          <div className="home-game-team">
                            {homeLogo ? (
                              <img src={resolveApiUrl(homeLogo)} alt={`${home} logo`} />
                            ) : (
                              <div className="home-game-fallback">{home.charAt(0)}</div>
                            )}
                            <span>{home}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {nextWeekGames.length > 0 && (
                <div className="home-games-more">
                  <Link className="ghost-link" to="/games">
                    View more
                  </Link>
                </div>
              )}
            </article>
          </div>

          <article className="home-panel standings-panel">
            <div className="panel-head">
              <h2>Standings</h2>
              <Link className="table-link" to="/teams">
                Teams
              </Link>
            </div>
            {standings.length === 0 && <p className="status">No teams available.</p>}
            {standings.length > 0 && (
              <table className="data-table standings-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    <th>Record</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team, index) => (
                    <tr key={team.id}>
                      <td data-label="Rank">
                        <span className="standings-rank">#{index + 1}</span>
                      </td>
                      <td data-label="Team">
                        <div className="standings-team">
                          {team.logo_url ? (
                            <img src={resolveApiUrl(team.logo_url)} alt={`${team.name} logo`} />
                          ) : (
                            <div className="standings-fallback">{team.name.charAt(0)}</div>
                          )}
                          <span>{team.name}</span>
                        </div>
                      </td>
                      <td data-label="Record" className="standings-record">
                        {(team.wins ?? 0)}-{(team.losses ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </>
      )}
    </section>
  );
}
