import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
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
      ? `Field ${fieldNumber}`
      : isFinal
        ? "Matchup complete"
        : "Scheduled matchup";

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
            <p className="game-details-kicker">Game details</p>
            <h2 id={titleId}>
              {awayTeam.name} vs {homeTeam.name}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className="game-details-close"
            type="button"
            onClick={onClose}
            aria-label="Close game details"
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
                <p className="game-details-team-label">Away</p>
                <p className="game-details-team-name">{awayTeam.name}</p>
              </div>
              {isFinal && score && <p className="game-details-team-score">{score.away}</p>}
            </div>

            <div className="game-details-center">
              {isFinal && score ? (
                <>
                  <p className="game-details-score-label">Final</p>
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
                <p className="game-details-team-label">Home</p>
                <p className="game-details-team-name">{homeTeam.name}</p>
              </div>
              {isFinal && score && <p className="game-details-team-score">{score.home}</p>}
            </div>
          </div>
        </section>

        <section className="game-details-section">
          <div className="game-details-section-head">
            <h3>Game Info</h3>
          </div>
          <dl className="game-info-list">
            <DetailRow
              label="Date & Time"
              value={`${formatFullGameDate(game)} • ${formatTime(game.time)}`}
            />
            {locationName && <DetailRow label="Location" value={locationName} />}
            {fieldNumber && <DetailRow label="Field" value={`Field ${fieldNumber}`} />}
            {address && <DetailRow label="Address" value={address} />}
          </dl>
          {mapsUrl ? (
            <div className="game-details-actions">
              <a
                className="button button-primary"
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Get Directions
              </a>
            </div>
          ) : null}
        </section>

        {notes ? (
          <section className="game-details-section game-details-section-notes">
            <div className="game-details-section-head">
              <h3>Notes</h3>
            </div>
            <p className="game-details-notes">{notes}</p>
          </section>
        ) : null}

        {footer ? <div className="game-details-actions game-details-actions-footer">{footer}</div> : null}
      </SurfaceCard>
    </div>
  );
}
