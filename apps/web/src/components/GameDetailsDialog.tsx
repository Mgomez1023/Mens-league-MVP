import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Game } from "../api";
import {
  formatFullGameDate,
  formatTime,
  getGameAddress,
  getGameFieldNumber,
  getGameLocationName,
  getGameNotes,
  getGameScore,
  getGameStatusMeta,
  isFinalGame,
} from "../utils/league";
import { StatusChip, SurfaceCard, TeamAvatar } from "./ui";

type TeamSummary = {
  name: string;
  logoSrc?: string | null;
};

type GameDetailsDialogProps = {
  game: Game | null;
  awayTeam: TeamSummary | null;
  homeTeam: TeamSummary | null;
  onClose: () => void;
  footer?: ReactNode;
};

type DetailRowProps = {
  label: string;
  value: ReactNode;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="game-info-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function GameDetailsDialog({
  game,
  awayTeam,
  homeTeam,
  onClose,
  footer,
}: GameDetailsDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!game) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [game, onClose]);

  if (!game || !awayTeam || !homeTeam) return null;

  const status = getGameStatusMeta(game.status);
  const isFinal = isFinalGame(game.status);
  const score = getGameScore(game);
  const locationName = getGameLocationName(game);
  const address = getGameAddress(game);
  const fieldNumber = getGameFieldNumber(game);
  const notes = getGameNotes(game);
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
  const heroCaption = locationName
    ? locationName
    : fieldNumber
      ? t("games.fieldWithNumber", { number: fieldNumber })
      : isFinal
        ? t("games.matchupComplete")
        : t("games.scheduleMatchup");

  return (
    <div
      className="modal-backdrop game-details-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <SurfaceCard className="modal-card game-details-dialog">
        <div className="game-details-header">
          <div className="game-details-header-copy">
            <p className="game-details-kicker">{t("games.gameDetails")}</p>
            <h2 id={titleId}>
              {awayTeam.name} {t("games.vs")} {homeTeam.name}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className="game-details-close"
            type="button"
            onClick={onClose}
            aria-label={t("buttons.close")}
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <section className="game-details-hero">
          <div className="game-details-hero-bar">
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
            <p className="game-details-hero-caption">{heroCaption}</p>
          </div>

          <div className="game-details-matchup">
            <div className="game-details-team game-details-team-away">
              <TeamAvatar name={awayTeam.name} src={awayTeam.logoSrc} size="lg" />
              <div className="game-details-team-copy">
                <p className="game-details-team-label">{t("games.away")}</p>
                <p className="game-details-team-name">{awayTeam.name}</p>
              </div>
              {isFinal && score && <p className="game-details-team-score">{score.away}</p>}
            </div>

            <div className="game-details-center">
              {isFinal && score ? (
                <>
                  <p className="game-details-score-label">{t("games.status.final")}</p>
                  <p className="game-details-scoreline">
                    <span>{score.away}</span>
                    <span className="game-details-score-divider">-</span>
                    <span>{score.home}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="game-details-score-label">{status.label}</p>
                  <p className="game-details-hero-time">{formatTime(game.time)}</p>
                  <p className="game-details-hero-date">{formatFullGameDate(game)}</p>
                </>
              )}
            </div>

            <div className="game-details-team game-details-team-home">
              <TeamAvatar name={homeTeam.name} src={homeTeam.logoSrc} size="lg" />
              <div className="game-details-team-copy">
                <p className="game-details-team-label">{t("games.home")}</p>
                <p className="game-details-team-name">{homeTeam.name}</p>
              </div>
              {isFinal && score && <p className="game-details-team-score">{score.home}</p>}
            </div>
          </div>
        </section>

        <section className="game-details-section">
          <div className="game-details-section-head">
            <h3>{t("games.gameInfo")}</h3>
          </div>
          <dl className="game-info-list">
            <DetailRow
              label={t("games.dateTime")}
              value={`${formatFullGameDate(game)} • ${formatTime(game.time)}`}
            />
            {locationName && <DetailRow label={t("games.location")} value={locationName} />}
            {fieldNumber && <DetailRow label={t("common.field")} value={t("games.fieldWithNumber", { number: fieldNumber })} />}
            {address && <DetailRow label={t("games.address")} value={address} />}
          </dl>
          {mapsUrl ? (
            <div className="game-details-actions">
              <a
                className="button button-primary"
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("buttons.getDirections")}
              </a>
            </div>
          ) : null}
        </section>

        {notes ? (
          <section className="game-details-section game-details-section-notes">
            <div className="game-details-section-head">
              <h3>{t("games.notes")}</h3>
            </div>
            <p className="game-details-notes">{notes}</p>
          </section>
        ) : null}

        {footer ? <div className="game-details-actions game-details-actions-footer">{footer}</div> : null}
      </SurfaceCard>
    </div>
  );
}
