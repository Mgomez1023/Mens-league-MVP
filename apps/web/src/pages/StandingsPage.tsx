import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { fetchGamesPublic, fetchTeamsPublic, resolveApiUrl } from "../api";
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
import { formatWinningPercentage, resolveStandings } from "../utils/league";

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
        const [teamData, gameData] = await Promise.all([
          fetchTeamsPublic(),
          fetchGamesPublic(),
        ]);
        if (!active) return;
        setTeams(resolveStandings(teamData, gameData));
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
              <div className="standings-table-shell">
                <div className="standings-table-mask" aria-hidden="true" />
                <div className="table-wrap standings-table-wrap-scroll">
                  <table className="league-table standings-table standings-table-detailed">
                    <thead>
                      <tr>
                        <th className="standings-header-team">{t("common.team")}</th>
                        <th>{t("common.gp")}</th>
                        <th>{t("common.wins")}</th>
                        <th>{t("common.losses")}</th>
                        <th>{t("common.pct")}</th>
                        <th>{t("common.rf")}</th>
                        <th>{t("common.ra")}</th>
                        <th>{t("common.total")}</th>
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
                          <td
                            className="standings-cell-team standings-cell-sticky standings-cell-sticky-team"
                            data-label={t("common.team")}
                          >
                            <div className="standings-team-cluster">
                              <span className="standings-rank">#{team.rank ?? index + 1}</span>
                              <TeamAvatar
                                name={team.name}
                                src={team.logo_url ? resolveApiUrl(team.logo_url) : null}
                                size="sm"
                              />
                              <div className="standings-team-copy">
                                <div className="table-team-name">{team.name}</div>
                                {team.home_field && (
                                  <div className="table-team-meta">{team.home_field}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="standings-cell-stat">
                            {team.games_played ?? 0}
                          </td>
                          <td className="standings-cell-stat">{team.wins ?? 0}</td>
                          <td className="standings-cell-stat">{team.losses ?? 0}</td>
                          <td className="standings-cell-stat standings-cell-pct">
                            {formatWinningPercentage(team)}
                          </td>
                          <td className="standings-cell-stat">
                            {team.runs_for ?? 0}
                          </td>
                          <td className="standings-cell-stat">
                            {team.runs_against ?? 0}
                          </td>
                          <td className="standings-cell-stat">
                            {team.run_differential ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="standings-scroll-hint">{t("standings.scrollHint")}</p>
            </>
          )}
        </SurfaceCard>
      )}
    </section>
  );
}
