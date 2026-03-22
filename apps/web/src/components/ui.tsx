import type { PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  titleAction?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  titleAction,
  actions,
  aside,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <div className="page-header-title-row">
          <h1>{title}</h1>
          {titleAction}
        </div>
        {description && <p className="page-description">{description}</p>}
      </div>
      {(actions || aside) && (
        <div className="page-header-actions">
          {aside}
          {actions}
        </div>
      )}
    </header>
  );
}

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-header-action">{action}</div>}
    </div>
  );
}

type SurfaceCardProps = PropsWithChildren<{
  className?: string;
  padded?: boolean;
  tone?: "default" | "accent" | "subtle";
}>;

export function SurfaceCard({
  className,
  padded = true,
  tone = "default",
  children,
}: SurfaceCardProps) {
  return (
    <section
      className={cx(
        "surface-card",
        padded && "surface-card-padded",
        tone !== "default" && `surface-card-${tone}`,
        className,
      )}
    >
      {children}
    </section>
  );
}

type NoticeProps = PropsWithChildren<{
  variant?: "info" | "success" | "warning" | "error";
  className?: string;
}>;

export function Notice({ variant = "info", className, children }: NoticeProps) {
  return <div className={cx("notice", `notice-${variant}`, className)}>{children}</div>;
}

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={cx("empty-state", compact && "empty-state-compact")}>
      <div className="empty-state-copy">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  const { t } = useTranslation();

  return (
    <div className="loading-state" aria-live="polite">
      <span className="loading-dot" aria-hidden="true" />
      <span>{label === "Loading..." ? t("common.loading") : label}</span>
    </div>
  );
}

type StatusChipProps = {
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  children: ReactNode;
};

export function StatusChip({ tone = "neutral", children }: StatusChipProps) {
  return <span className={cx("status-chip", `status-chip-${tone}`)}>{children}</span>;
}

type StatPillProps = {
  label: string;
  value: string | number;
};

export function StatPill({ label, value }: StatPillProps) {
  return (
    <div className="stat-pill">
      <span className="stat-pill-value">{value}</span>
      <span className="stat-pill-label">{label}</span>
    </div>
  );
}

type TeamAvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
};

export function TeamAvatar({ name, src, size = "md" }: TeamAvatarProps) {
  const { t } = useTranslation();

  return (
    <div className={cx("team-avatar", `team-avatar-${size}`)}>
      {src ? (
        <img src={src} alt={t("common.logoAlt", { name })} loading="lazy" />
      ) : (
        <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}
