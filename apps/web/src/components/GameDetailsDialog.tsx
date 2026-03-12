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
    <div className="game-details-row">
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
          <div className="game-details-header-actions">
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
            <button
              ref={closeButtonRef}
              className="button button-secondary button-small"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="game-details-matchup">
          <div className="game-details-team">
            <TeamAvatar name={awayTeam.name} src={awayTeam.logoSrc} size="lg" />
            <div>
              <p className="game-details-team-label">Away</p>
              <p className="game-details-team-name">{awayTeam.name}</p>
            </div>
            {isFinal && score && <p className="game-details-team-score">{score.away}</p>}
          </div>

          <div className="game-details-center">
            {isFinal && score ? (
              <>
                <p className="game-details-score-label">Final score</p>
                <p className="game-details-scoreline">
                  {score.away} - {score.home}
                </p>
              </>
            ) : (
              <p className="game-details-versus">VS.</p>
            )}
          </div>

          <div className="game-details-team">
            <TeamAvatar name={homeTeam.name} src={homeTeam.logoSrc} size="lg" />
            <div>
              <p className="game-details-team-label">Home</p>
              <p className="game-details-team-name">{homeTeam.name}</p>
            </div>
            {isFinal && score && <p className="game-details-team-score">{score.home}</p>}
          </div>
        </div>

        <dl className="game-details-grid">
          <DetailRow label="Date" value={formatFullGameDate(game)} />
          <DetailRow label="Time" value={formatTime(game.time)} />
          {locationName && <DetailRow label="Location" value={locationName} />}
          {fieldNumber && <DetailRow label="Field" value={fieldNumber} />}
          {address && <DetailRow label="Address" value={address} />}
          {notes && <DetailRow label="Notes" value={notes} />}
          {isFinal && score && (
            <DetailRow
              label="Result"
              value={`${awayTeam.name} ${score.away} - ${score.home} ${homeTeam.name}`}
            />
          )}
        </dl>

        <div className="game-details-actions">
          {mapsUrl ? (
            <a
              className="button button-primary"
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Get Directions
            </a>
          ) : null}
          {footer}
        </div>
      </SurfaceCard>
    </div>
  );
}
