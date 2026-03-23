import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
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
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        setError(t("standings.loadError"));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [t]);

  const openRoster = (teamId: number) => {
    void navigate(`/teams/${teamId}/roster`);
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t("standings.eyebrow")}
        title={t("standings.title")}
        description=""
        titleAction={
          <Link className="button button-secondary button-small page-title-action-compact" to="/games">
            {t("standings.viewSchedule")}
          </Link>
        }
      />

      {loading && <LoadingState label={t("standings.loading")} />}
      {!loading && error && <Notice variant="error">{error}</Notice>}

      {!loading && !error && (
        <SurfaceCard className="standings-surface">
          <SectionHeader
            title={t("standings.sectionTitle")}
            description={t("standings.sectionDescription")}
          />
          {teams.length === 0 ? (
            <EmptyState
              title={t("standings.emptyTitle")}
              description={t("standings.emptyDescription")}
            />
          ) : (
            <>
              <div className="table-wrap standings-table-wrap">
                <table className="league-table standings-table">
                  <thead>
                    <tr>
                      <th>{t("common.rank")}</th>
                      <th>{t("common.team")}</th>
                      <th>{t("common.wins")}</th>
                      <th>{t("common.losses")}</th>
                      <th>{t("common.record")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team, index) => (
                      <tr
                        className="standings-row"
                        key={team.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => openRoster(team.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openRoster(team.id);
                          }
                        }}
                      >
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
                            <div>
                              <div className="table-team-name">{team.name}</div>
                              {team.home_field && (
                                <div className="table-team-meta">{team.home_field}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="standings-cell-stat" data-label={t("common.wins")}>{team.wins ?? 0}</td>
                        <td className="standings-cell-stat" data-label={t("common.losses")}>{team.losses ?? 0}</td>
                        <td className="standings-cell-record" data-label={t("common.record")}>{getRecord(team)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ol className="standings-mobile-list" aria-label={t("aria.leagueStandings")}>
                {teams.map((team, index) => {
                  const wins = team.wins ?? 0;
                  const losses = team.losses ?? 0;

                  return (
                    <li className="standings-mobile-item" key={team.id}>
                      <Link className="standings-mobile-link" to={`/teams/${team.id}/roster`}>
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
                            {t("standings.summaryLine", { wins, losses })}
                          </div>
                        </article>
                      </Link>
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
