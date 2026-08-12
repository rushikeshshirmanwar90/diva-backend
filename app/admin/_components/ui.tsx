"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
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

/**
 * A centred spinner.
 *
 * No longer used for page loads — the skeletons below replaced it, because a
 * one-row spinner swapped for a twenty-row table reflows the whole panel. Kept
 * for the case it is still right: a small in-place wait inside an already-drawn
 * layout, where there is no shape to stand in for and nothing to reflow.
 */
export function LoadingRow({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-row">
      <Loader2 className="spin" />
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

/**
 * Loading placeholders shaped like the thing being loaded.
 *
 * These replace a centred spinner on first load. The spinner was honest but
 * cost a full reflow when it was swapped for a table — the panel jumped from
 * one 36px row to twenty, which on a fast connection reads as the page
 * glitching rather than as it finishing.
 *
 * They are shown on **first load only**. `useAsyncData` deliberately keeps the
 * previous data on screen while refetching, so a filter change re-renders the
 * table you are already looking at instead of blanking it to grey bars — which
 * would be worse than the spinner it replaced.
 */

export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
}) {
  return <div className={`skeleton ${className}`} style={{ width, height }} />;
}

/**
 * Wraps skeleton markup so assistive tech hears "Loading products…" once rather
 * than being walked through a dozen decorative rectangles.
 *
 * `aria-busy` on the region is the part screen readers act on; `aria-hidden` on
 * the bars is what stops them being described individually.
 */
function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/**
 * Placeholder rows for a `data-table`.
 *
 * `columns` must match the real header count or the widths drift and the swap
 * is visible. The first column mirrors `.table-product` — image square plus two
 * lines — because every table in this console leads with one.
 */
export function TableSkeleton({
  columns,
  headers,
  rows = 6,
  label = "Loading…",
  leadingMark = true,
  trailingActions = true,
}: {
  columns: number;
  /**
   * The real column labels.
   *
   * Worth passing. They are static strings that need no data, so rendering
   * them immediately tells you what is coming — and, more practically, keeps
   * the header row from popping into existence and pushing every row down when
   * the response lands. The last entry may be `""` for an actions column.
   */
  headers?: string[];
  rows?: number;
  label?: string;
  /** First cell is a product/customer mark with two lines of text. */
  leadingMark?: boolean;
  /** Last cell holds row action buttons. */
  trailingActions?: boolean;
}) {
  // Middle cells get varied widths. Uniform bars read as a rendering artifact;
  // ragged ones read as text that has not arrived.
  const widths = ["72%", "56%", "84%", "48%", "66%", "60%"];

  return (
    <LoadingRegion label={label}>
      <div className="table-scroll">
        <table className="data-table">
          {headers && (
            <thead>
              <tr>
                {headers.map((heading, column) => (
                  <th key={column}>{heading || <span className="sr-only">Actions</span>}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                {Array.from({ length: columns }, (_, column) => {
                  if (column === 0 && leadingMark) {
                    return (
                      <td key={column}>
                        <div className="skeleton-product">
                          <Skeleton className="skeleton-mark" />
                          <div className="skeleton-product-copy">
                            <Skeleton className="skeleton-line-strong" width="62%" />
                            <Skeleton className="skeleton-line" width="40%" />
                          </div>
                        </div>
                      </td>
                    );
                  }

                  if (column === columns - 1 && trailingActions) {
                    return (
                      <td key={column}>
                        <div className="skeleton-actions">
                          <Skeleton className="skeleton-action" />
                          <Skeleton className="skeleton-action" />
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td key={column}>
                      <Skeleton
                        className="skeleton-line"
                        width={widths[(row + column) % widths.length]}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LoadingRegion>
  );
}

/** Placeholder rows for the `tree-list` used by categories and collections. */
export function TreeSkeleton({ rows = 5, label = "Loading…" }: { rows?: number; label?: string }) {
  const widths = ["38%", "52%", "30%", "44%", "34%"];

  return (
    <LoadingRegion label={label}>
      <div className="tree-list">
        {Array.from({ length: rows }, (_, row) => (
          <div className="skeleton-tree-row" key={row}>
            <div className="skeleton-product-copy">
              <Skeleton className="skeleton-line-strong" width={widths[row % widths.length]} />
              <Skeleton className="skeleton-line" width="22%" />
            </div>
            <Skeleton className="skeleton-badge" />
            <div className="skeleton-actions">
              <Skeleton className="skeleton-action" />
              <Skeleton className="skeleton-action" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/**
 * Placeholder for the product editor.
 *
 * Mirrors `.editor-layout` — a wide column of form cards beside a narrower
 * sidebar — because that page loads a single large document and the old spinner
 * left the whole viewport empty while it did.
 */
export function EditorSkeleton({ label = "Loading…" }: { label?: string }) {
  const card = (fields: number) => (
    <div className="form-card">
      <div className="form-card-heading">
        <div style={{ flex: 1 }}>
          <Skeleton className="skeleton-line-strong" width="34%" />
          <div style={{ marginTop: 8 }}>
            <Skeleton className="skeleton-line" width="58%" />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {Array.from({ length: fields }, (_, field) => (
          <div key={field}>
            <Skeleton className="skeleton-line" width="24%" />
            <div style={{ marginTop: 8 }}>
              <Skeleton height={38} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <LoadingRegion label={label}>
      <div className="editor-layout">
        <div className="editor-main">
          {card(3)}
          {card(2)}
        </div>
        <div className="editor-side">
          {card(2)}
          {card(1)}
        </div>
      </div>
    </LoadingRegion>
  );
}

/** Placeholder cards matching `.metric-grid` on the overview. */
export function MetricGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="metric-grid" aria-hidden="true">
      {Array.from({ length: cards }, (_, card) => (
        <article className="skeleton-metric" key={card}>
          <div className="skeleton-metric-top">
            <Skeleton className="skeleton-line" width="42%" />
            <Skeleton className="skeleton-action" />
          </div>
          {/* The value, which is the tallest thing in a real card — matching
              its height is what stops the grid resizing when figures land. */}
          <Skeleton className="skeleton-metric-value" width="55%" />
          <Skeleton className="skeleton-line skeleton-metric-foot" width="70%" />
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error dialog
// ---------------------------------------------------------------------------

/**
 * A failed load, as a modal.
 *
 * `ErrorRow` below is still the right surface for a *recoverable* problem next
 * to working content. It is the wrong one when the fetch that fills the screen
 * failed: it renders as a thin amber strip above an empty table, directly under
 * a toolbar reading "0 results", and is read as part of the empty state rather
 * than as the reason for it.
 *
 * So a load failure opens this, and dismissing it leaves the inline row behind
 * as the persistent record — the dialog gets attention, the row gives you
 * somewhere to retry from afterwards. Dismissing must not be a dead end.
 *
 * `alertdialog` rather than `dialog`: it announces the message on open instead
 * of waiting for focus to reach it.
 */
export function ErrorDialog({
  open,
  title = "Something went wrong",
  message,
  detail,
  retrying = false,
  onRetry,
  onClose,
}: {
  open: boolean;
  title?: string;
  message: string;
  /** Gateway text, status codes — whatever gets pasted into a bug report. */
  detail?: string;
  retrying?: boolean;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** Where focus was before the dialog stole it, so it can be handed back. */
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement;
    // Focus the panel, not the first button: a keyboard user lands on the
    // message and tabs to a choice, rather than being parked on "Try again"
    // with no idea what failed.
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);

      /**
       * Restore focus only when the dialog's removal is what dropped it.
       *
       * Tearing down the panel leaves `activeElement` on `<body>`, and a
       * keyboard user is then stranded at the top of the document. Handing
       * focus back to whatever opened the dialog is the fix.
       *
       * The guard matters: if something else deliberately took focus — a retry
       * that moved on, a field the page focused itself — `activeElement` is
       * that element, and stealing it back would be the bug this is meant to
       * prevent. Checking the panel's own `contains()` here would not work;
       * by cleanup the node is detached and contains nothing.
       */
      const active = document.activeElement;

      if (!active || active === document.body) {
        (returnFocusRef.current as HTMLElement | null)?.focus?.();
      }
    };
  }, [open, onClose]);

  const onBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only a press that both started and ended on the backdrop closes —
      // a drag that began inside the panel and released outside must not.
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={onBackdropClick}>
      <div
        ref={panelRef}
        className="dialog-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-error-dialog-title"
        aria-describedby="admin-error-dialog-message"
        tabIndex={-1}
      >
        <div className="dialog-icon">
          <TriangleAlert />
        </div>

        <h2 id="admin-error-dialog-title">{title}</h2>
        <p id="admin-error-dialog-message">{message}</p>

        {detail && (
          <details className="dialog-detail">
            <summary>Technical details</summary>
            <pre>{detail}</pre>
          </details>
        )}

        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose}>
            Dismiss
          </button>
          {onRetry && (
            <button className="primary-button" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="spin" /> : <RefreshCw />}
              {retrying ? "Retrying…" : "Try again"}
            </button>
          )}
        </div>
      </div>
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
