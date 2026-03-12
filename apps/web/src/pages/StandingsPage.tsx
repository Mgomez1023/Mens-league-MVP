import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTeamsPublic, resolveApiUrl } from "../api";
import type { Team } from "../api";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  SectionHeader,
  SurfaceCard,
  TeamAvatar,
} from "../components/ui";
import { getRecord, sortStandings } from "../utils/league";

export default function StandingsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTeamsPublic();
        if (!active) return;
        setTeams(sortStandings(data));
      } catch {
        if (!active) return;
        setError("Standings are unavailable right now.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="League table"
        title="Standings"
        description=""
        actions={
          <Link className="button button-secondary" to="/games">
            View schedule
          </Link>
        }
      />

      {loading && <LoadingState label="Loading standings..." />}
      {!loading && error && <Notice variant="error">{error}</Notice>}

      {!loading && !error && (
        <SurfaceCard>
          <SectionHeader
            title="League standings"
            description="Wins and losses update as final scores are posted."
          />
          {teams.length === 0 ? (
            <EmptyState
              title="No standings yet"
              description="Add teams and final game scores to generate the league table."
            />
          ) : (
            <>
              <div className="table-wrap standings-table-wrap">
                <table className="league-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Team</th>
                      <th>Wins</th>
                      <th>Losses</th>
                      <th>Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team, index) => (
                      <tr key={team.id}>
                        <td data-label="Rank">
                          <span className="standings-rank">#{index + 1}</span>
                        </td>
                        <td data-label="Team">
                          <div className="table-team">
                            <TeamAvatar
                              name={team.name}
                              src={team.logo_url ? resolveApiUrl(team.logo_url) : null}
                              size="sm"
                            />
                            <div>
                              <div className="table-team-name">{team.name}</div>
                              {team.home_field && (
                                <div className="table-team-meta">{team.home_field}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label="Wins">{team.wins ?? 0}</td>
                        <td data-label="Losses">{team.losses ?? 0}</td>
                        <td data-label="Record">{getRecord(team)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ol className="standings-mobile-list" aria-label="League standings">
                {teams.map((team, index) => {
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
      )}
    </section>
  );
}
