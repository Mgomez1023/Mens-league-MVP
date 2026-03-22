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

type PublicGameCardProps = {
  game: Game;
  awayTeamName: string;
  awayTeamLogoSrc?: string | null;
  homeTeamName: string;
  homeTeamLogoSrc?: string | null;
  variant?: "featured" | "standard";
  avatarSize?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
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
  avatarSize,
  footer,
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

  return (
    <article className={cx("public-game-card", `public-game-card-${variant}`, className)}>
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
    </article>
  );
}
