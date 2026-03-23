import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Game } from "../api";
import { getCurrentLocale } from "../i18n";
import { formatDate, formatTime, getGameStatusMeta } from "../utils/league";
import { StatusChip, TeamAvatar } from "./ui";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatHeaderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return date.toLocaleDateString(getCurrentLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatFullCardDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return date.toLocaleDateString(getCurrentLocale(), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type PublicGameCardProps = {
  game: Game;
  awayTeamName: string;
  awayTeamLogoSrc?: string | null;
  homeTeamName: string;
  homeTeamLogoSrc?: string | null;
  variant?: "featured" | "standard";
  layout?: "default" | "schedule";
  avatarSize?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
  detailLabel?: string | null;
  showMetaDate?: boolean;
  className?: string;
};

export function PublicGameCard({
  game,
  awayTeamName,
  awayTeamLogoSrc,
  homeTeamName,
  homeTeamLogoSrc,
  variant = "standard",
  layout = "default",
  avatarSize,
  footer,
  detailLabel,
  showMetaDate = false,
  className,
}: PublicGameCardProps) {
  const { t } = useTranslation();
  const status = getGameStatusMeta(game.status);
  const isFinal = (game.status ?? "").toUpperCase() === "FINAL";
  const metaParts = [
    formatTime(game.time),
    showMetaDate && formatDate(game.date),
    game.field || t("common.fieldTbd"),
  ]
    .filter(Boolean)
    .join(" • ");
  const resolvedAvatarSize = avatarSize ?? (variant === "featured" ? "xl" : "lg");
  const fieldLabel = game.field || t("common.fieldTbd");
  const hasScheduleFooter = layout === "schedule" && (detailLabel || footer);

  return (
    <article className={cx("public-game-card", `public-game-card-${variant}`, className)}>
      {layout === "schedule" ? (
        <>
          <div className="public-game-card-topline public-game-card-topline-schedule">
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
            <p className="public-game-card-location">{fieldLabel}</p>
          </div>

          <div className="public-game-card-matchup public-game-card-matchup-schedule">
            <div className="public-game-card-team public-game-card-team-schedule">
              <TeamAvatar name={awayTeamName} src={awayTeamLogoSrc} size={resolvedAvatarSize} />
              <div className="public-game-card-team-copy">
                <p className="public-game-card-team-role">{t("games.away")}</p>
                <p className="public-game-card-team-name">{awayTeamName}</p>
              </div>
              {isFinal && <p className="public-game-card-team-score">{game.away_score ?? "-"}</p>}
            </div>

            <div
              className="public-game-card-center public-game-card-center-schedule"
              aria-label={t("games.viewDetailsFor", { awayTeamName, homeTeamName })}
            >
              {isFinal ? (
                <>
                  <p className="public-game-card-center-label">{status.label}</p>
                  <p className="public-game-card-center-scoreline">
                    <span>{game.away_score ?? "-"}</span>
                    <span className="public-game-card-center-score-divider">-</span>
                    <span>{game.home_score ?? "-"}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="public-game-card-center-label">{status.label}</p>
                  <p className="public-game-card-center-time">{formatTime(game.time)}</p>
                </>
              )}
              <p className="public-game-card-center-date">{formatFullCardDate(game.date)}</p>
            </div>

            <div className="public-game-card-team public-game-card-team-schedule">
              <TeamAvatar name={homeTeamName} src={homeTeamLogoSrc} size={resolvedAvatarSize} />
              <div className="public-game-card-team-copy">
                <p className="public-game-card-team-role">{t("games.home")}</p>
                <p className="public-game-card-team-name">{homeTeamName}</p>
              </div>
              {isFinal && <p className="public-game-card-team-score">{game.home_score ?? "-"}</p>}
            </div>
          </div>

          {hasScheduleFooter ? (
            <div className="public-game-card-footer public-game-card-footer-schedule">
              {detailLabel ? (
                <span className="public-game-card-detail-indicator" aria-hidden="true">
                  {detailLabel}
                </span>
              ) : (
                <span />
              )}
              {footer ? <div className="public-game-card-footer-actions">{footer}</div> : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="public-game-card-topline">
            <p className="public-game-card-date">{formatHeaderDate(game.date)}</p>
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
          </div>

          <div className="public-game-card-matchup">
            <div className="public-game-card-team">
              <TeamAvatar name={awayTeamName} src={awayTeamLogoSrc} size={resolvedAvatarSize} />
              <p className="public-game-card-team-name">{awayTeamName}</p>
              {isFinal && <p className="public-game-card-team-score">{game.away_score ?? "-"}</p>}
            </div>

            <div className="public-game-card-versus" aria-label={t("games.viewDetailsFor", { awayTeamName, homeTeamName })}>
              {t("games.vs")}
            </div>

            <div className="public-game-card-team">
              <TeamAvatar name={homeTeamName} src={homeTeamLogoSrc} size={resolvedAvatarSize} />
              <p className="public-game-card-team-name">{homeTeamName}</p>
              {isFinal && <p className="public-game-card-team-score">{game.home_score ?? "-"}</p>}
            </div>
          </div>

          <p className="public-game-card-meta">{metaParts}</p>

          {footer && <div className="public-game-card-footer">{footer}</div>}
        </>
      )}
    </article>
  );
}
