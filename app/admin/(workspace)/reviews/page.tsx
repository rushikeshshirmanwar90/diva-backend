"use client";

import { useState } from "react";
import { BadgeCheck, Check, Star, StarOff, X } from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import { api, AdminApiError, type AdminReview, type PaginationMeta } from "@/app/admin/_lib/api";
import {
  EmptyRow,
  ErrorDialog,
  ErrorRow,
  PageHeading,
  Pagination,
  StatusBadge,
  Toolbar,
  TreeSkeleton,
  type StatusTone,
} from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/**
 * Customer reviews: moderation plus the homepage picks.
 *
 * The star on each row is what feeds the storefront's "What customers
 * actually say" section. Featuring is deliberately a toggle on the review
 * rather than a separate testimonials editor with its own text — the homepage
 * quotes real customers verbatim, and staff choose *which* ones, not what
 * they said. The server refuses to feature anything that is not approved or
 * has no text, and caps how many can be up at once.
 */

const PAGE_SIZE = 20;

type Filter = "featured" | "all" | "PENDING" | "APPROVED" | "REJECTED";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "featured", label: "On the homepage" },
  { key: "all", label: "All reviews" },
  { key: "APPROVED", label: "Approved" },
  { key: "PENDING", label: "Pending" },
  { key: "REJECTED", label: "Rejected" },
];

const STATUS_BADGE: Record<AdminReview["status"], { label: string; tone: StatusTone }> = {
  APPROVED: { label: "Approved", tone: "stock" },
  PENDING: { label: "Pending", tone: "processing" },
  REJECTED: { label: "Rejected", tone: "low" },
};

function queryFor(filter: Filter): Record<string, unknown> {
  if (filter === "featured") return { featured: true };
  if (filter === "all") return {};
  return { status: filter };
}

export default function ReviewsPage() {
  const { notify } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [actionError, setActionError] = useState("");

  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useAsyncData(
    async () => {
      const response = await api.get<AdminReview[]>("/admin/reviews", {
        ...queryFor(filter),
        page,
        limit: PAGE_SIZE,
      });
      return { items: response.data, meta: response.meta as PaginationMeta | undefined };
    },
    [filter, page],
    { errorMessage: "Could not load the reviews." },
  );

  const reviews = data?.items ?? [];
  const meta = data?.meta;
  const errorDialog = useErrorDialog(loadError, reload);

  const run = async (id: string, work: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    setActionError("");
    try {
      await work();
      notify(done);
      await reload();
    } catch (caught) {
      setActionError(
        caught instanceof AdminApiError ? caught.message : "Could not update that review.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleFeatured = (review: AdminReview) =>
    run(
      review._id,
      () => api.patch(`/admin/reviews/${review._id}/feature`, { isFeatured: !review.isFeatured }),
      review.isFeatured ? "Removed from the homepage" : "Added to the homepage",
    );

  const approve = (review: AdminReview) =>
    run(
      review._id,
      () => api.patch(`/admin/reviews/${review._id}`, { status: "APPROVED" }),
      "Review approved",
    );

  const reject = async () => {
    if (!rejecting) return;
    const { id, reason } = rejecting;
    if (!reason.trim()) {
      setActionError("Give a reason for rejecting this review.");
      return;
    }
    await run(
      id,
      () => api.patch(`/admin/reviews/${id}`, { status: "REJECTED", rejectionReason: reason.trim() }),
      "Review rejected",
    );
    setRejecting(null);
  };

  return (
    <>
      <PageHeading
        eyebrow="Storefront"
        title="Reviews"
        description="Star a review to show it in the homepage's “What customers actually say” section. Only approved reviews with text can be featured."
      />

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`chip${filter === entry.key ? " chip-selected" : ""}`}
            onClick={() => {
              setFilter(entry.key);
              setPage(1);
            }}
          >
            {entry.key === "featured" && <Star />}
            {entry.label}
          </button>
        ))}
      </div>

      {actionError && <ErrorRow message={actionError} />}

      <div className="panel list-panel">
        <Toolbar count={meta?.total ?? reviews.length} />

        {loading ? (
          <TreeSkeleton label="Loading reviews…" />
        ) : loadError ? null : reviews.length === 0 ? (
          <EmptyRow
            title={filter === "featured" ? "Nothing on the homepage yet" : "No reviews here"}
            description={
              filter === "featured"
                ? "Open “Approved” and star the reviews you want customers to see first."
                : "Reviews customers leave on product pages will show up here."
            }
          />
        ) : (
          <div className="tree-list">
            {reviews.map((review) => {
              const busy = busyId === review._id;
              const badge = STATUS_BADGE[review.status];
              const canFeature = review.status === "APPROVED" && Boolean(review.body?.trim());
              return (
                <div key={review._id}>
                  <div className="tree-row" style={{ alignItems: "flex-start" }}>
                    <button
                      type="button"
                      className="row-action"
                      onClick={() => void toggleFeatured(review)}
                      disabled={busy || (!review.isFeatured && !canFeature)}
                      aria-pressed={review.isFeatured}
                      aria-label={
                        review.isFeatured ? "Remove from the homepage" : "Show on the homepage"
                      }
                      title={
                        review.isFeatured
                          ? "Remove from the homepage"
                          : canFeature
                            ? "Show on the homepage"
                            : "Approve the review first — only approved reviews with text can be featured"
                      }
                      style={review.isFeatured ? { color: "#d97706" } : undefined}
                    >
                      {review.isFeatured ? <Star fill="currentColor" /> : <StarOff />}
                    </button>

                    <div className="tree-row-main" style={{ alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <strong>
                          {"★".repeat(review.rating)}
                          <span style={{ color: "#cbd5e1" }}>{"★".repeat(5 - review.rating)}</span>
                          {review.title ? ` · ${review.title}` : ""}
                        </strong>
                        {review.body ? (
                          <p style={{ margin: "6px 0 0", color: "#334155", fontSize: 13, lineHeight: 1.5 }}>
                            {review.body}
                          </p>
                        ) : (
                          <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>
                            No written review — rating only.
                          </p>
                        )}
                        <small>
                          {review.userId?.name ?? "Deleted customer"}
                          {review.isVerifiedPurchase && (
                            <>
                              {" "}
                              <BadgeCheck
                                style={{ width: 12, height: 12, verticalAlign: "-2px", color: "#15803d" }}
                              />{" "}
                              verified purchase
                            </>
                          )}
                          {" · "}
                          {review.productId?.title ?? "Deleted product"}
                          {" · "}
                          {new Date(review.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {review.status === "REJECTED" && review.rejectionReason
                            ? ` · Rejected: ${review.rejectionReason}`
                            : ""}
                        </small>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {review.isFeatured && <StatusBadge label="Homepage" tone="shipped" />}
                      <StatusBadge label={badge.label} tone={badge.tone} />
                      <div className="tree-actions">
                        {review.status !== "APPROVED" && (
                          <button
                            className="row-action"
                            onClick={() => void approve(review)}
                            disabled={busy}
                            aria-label="Approve review"
                            title="Approve"
                          >
                            <Check />
                          </button>
                        )}
                        {review.status !== "REJECTED" && (
                          <button
                            className="row-action"
                            onClick={() => setRejecting({ id: review._id, reason: "" })}
                            disabled={busy}
                            aria-label="Reject review"
                            title="Reject"
                          >
                            <X />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {rejecting?.id === review._id && (
                    <div className="variant-card" style={{ margin: "0 0 12px 40px" }}>
                      <label className="field">
                        <span>
                          Reason for rejecting <b>*</b>
                        </span>
                        <input
                          value={rejecting.reason}
                          onChange={(event) => setRejecting({ id: review._id, reason: event.target.value })}
                          placeholder="Contains personal information"
                          autoFocus
                        />
                        <small>Kept on record; the customer does not see it.</small>
                      </label>
                      <div className="editor-footer" style={{ paddingTop: 14 }}>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setRejecting(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => void reject()}
                          disabled={busy}
                        >
                          Reject review
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {meta && <Pagination page={page} totalPages={meta.totalPages} onChange={setPage} />}
      </div>

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load the reviews"
        message={loadError}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
