"use client";

import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Loader2,
  Plus,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { initials as toInitials, tone as toTone } from "@/app/admin/_lib/format";

/**
 * The design's reusable pieces, extracted.
 *
 * In the mock these were inline in one 253-line component. Pulled out here
 * because eight screens use them, and the alternative is eight copies of the
 * same markup drifting apart the first time a padding changes.
 *
 * Class names are unchanged from the design so the stylesheet ports verbatim.
 */

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
  actionHref,
  onAction,
  actionIcon: ActionIcon = Plus,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
  actionHref?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action &&
        (actionHref ? (
          <Link href={actionHref} className="primary-button">
            <ActionIcon />
            {action}
          </Link>
        ) : (
          <button className="primary-button" onClick={onAction}>
            <ActionIcon />
            {action}
          </button>
        ))}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  delta,
  direction,
  icon: Icon,
  footnote,
}: {
  label: string;
  value: string;
  /** Omit when there is no prior period to compare against. */
  delta?: string;
  direction?: "up" | "down";
  icon: LucideIcon;
  footnote?: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      {delta ? (
        <div className={`metric-delta ${direction === "down" ? "metric-delta-down" : ""}`}>
          {direction === "down" ? <ArrowDownRight /> : <ArrowUpRight />} {delta}{" "}
          <span>vs last month</span>
        </div>
      ) : (
        /**
         * A neutral footnote where the design showed a percentage change.
         * Most of these metrics have no historical series to compare against
         * yet, and inventing "+12.8%" would be a fabricated number on the first
         * screen an admin sees every morning.
         */
        <div className="metric-footnote">{footnote ?? " "}</div>
      )}
    </article>
  );
}

export type StatusTone = "paid" | "processing" | "shipped" | "delivered" | "low" | "stock";

export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={`status-badge status-${tone}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

/** Maps a product's publish state onto the design's badge tones. */
export function ProductStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: StatusTone }> = {
    ACTIVE: { label: "Active", tone: "stock" },
    DRAFT: { label: "Draft", tone: "low" },
    ARCHIVED: { label: "Archived", tone: "processing" },
  };
  const entry = map[status] ?? { label: status, tone: "processing" as StatusTone };
  return <StatusBadge label={entry.label} tone={entry.tone} />;
}

/**
 * Stock badge driven by the variant's own threshold rather than a global number
 * — a bridal set held one at a time and a silver charm held fifty are not low
 * at the same count.
 */
export function StockBadge({ available, threshold }: { available: number; threshold: number }) {
  if (available <= 0) return <StatusBadge label="Out of stock" tone="low" />;
  if (available <= threshold) return <StatusBadge label="Low stock" tone="low" />;
  return <StatusBadge label="In stock" tone="stock" />;
}

/**
 * The square beside a product's name.
 *
 * Shows the product's own photo when it has one, and falls back to tinted
 * initials otherwise — a catalogue mid-upload has both, and a broken-image icon
 * in half the rows reads as a bug rather than as missing artwork.
 *
 * `aria-hidden` either way: the product title sits immediately beside it, so
 * announcing the image would only repeat what the row already says.
 */
export function ProductMark({
  label,
  keySeed,
  imageUrl,
}: {
  label: string;
  keySeed: string;
  imageUrl?: string;
}) {
  if (imageUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img className="product-mark product-mark-image" src={imageUrl} alt="" aria-hidden="true" />
    );
  }

  return (
    <div className={`product-mark product-mark-${toTone(keySeed)}`} aria-hidden="true">
      <span>{toInitials(label)}</span>
    </div>
  );
}

export function Toolbar({
  count,
  action,
  actionHref,
  onAction,
  onToggleFilters,
  showFilters,
  onExport,
}: {
  count: number;
  action?: string;
  actionHref?: string;
  onAction?: () => void;
  onToggleFilters?: () => void;
  showFilters?: boolean;
  onExport?: () => void;
}) {
  return (
    <div className="list-toolbar">
      <div className="result-count">
        {count} {count === 1 ? "result" : "results"}
      </div>
      <div className="toolbar-actions">
        {onToggleFilters && (
          <button
            className={`secondary-button ${showFilters ? "button-selected" : ""}`}
            onClick={onToggleFilters}
          >
            <SlidersHorizontal />
            Filters
          </button>
        )}
        {onExport && (
          <button className="secondary-button" onClick={onExport}>
            <Download />
            Export
          </button>
        )}
        {action &&
          (actionHref ? (
            <Link href={actionHref} className="primary-button">
              <Plus />
              {action}
            </Link>
          ) : (
            <button className="primary-button" onClick={onAction}>
              <Plus />
              {action}
            </button>
          ))}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button
        className="secondary-button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft />
        Previous
      </button>
      <span className="pagination-status">
        Page {page} of {totalPages}
      </span>
      <button
        className="secondary-button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ChevronRight />
      </button>
    </div>
  );
}

export function LoadingRow({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-row">
      <Loader2 className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorRow({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="form-alert" role="alert">
      <Info />
      <span>{message}</span>
      {onRetry && (
        <button className="text-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyRow({
  title,
  description,
  action,
  actionHref,
}: {
  title: string;
  description: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="empty-row">
      <strong>{title}</strong>
      <span>{description}</span>
      {action && actionHref && (
        <Link href={actionHref} className="secondary-button">
          {action}
        </Link>
      )}
    </div>
  );
}
