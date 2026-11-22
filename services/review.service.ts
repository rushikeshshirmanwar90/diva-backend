import { ApiError } from "@/lib/api/errors";
import * as reviews from "@/repositories/review.repository";
import * as products from "@/repositories/product.repository";
import * as users from "@/repositories/user.repository";
import { ProductModel } from "@/models/Product";
import { reviewReportsEmail } from "@/config/env";
import { queueMail, reviewReportedEmail } from "@/lib/send-mail";
import type {
  CreateReviewInput,
  ListReviewsQuery,
  ReportReviewInput,
} from "@/validators/review";

/**
 * Review business logic.
 *
 * Two rules live here and nowhere else:
 *
 *  1. **The author is the session, never the request.** Nothing a client sends
 *     decides who wrote a review.
 *  2. **"Verified purchase" is derived, never claimed.** It comes from the
 *     reviewer's own delivered orders.
 *
 * Every submission lands `APPROVED` and counts toward the product's rating
 * immediately — moderation is opt-out (`moderateReview` can still reject one
 * after the fact) rather than a gate before publication.
 */

/**
 * `viewerId` is the signed-in caller, if any: their blocked authors and the
 * reviews they reported are left out of what they see.
 */
export async function listForProduct(slug: string, query: ListReviewsQuery, viewerId?: string) {
  const product = await products.findBySlug(slug, { publicOnly: true });
  if (!product) throw ApiError.notFound("We could not find that product.");

  const viewer = viewerId
    ? { id: viewerId, blockedUserIds: await users.getBlockedUserIds(viewerId) }
    : undefined;

  const { items, total } = await reviews.listApproved(String(product._id), query, viewer);

  return {
    items,
    total,
    summary: { ratingAvg: product.ratingAvg ?? 0, ratingCount: product.ratingCount ?? 0 },
  };
}

/**
 * Submits a review, or replaces this customer's previous one.
 *
 * Returns the saved review together with a flag the storefront uses to explain
 * what happens next — a customer who does not see their words appear will
 * assume the form is broken, and will submit again.
 */
export async function submitReview(input: CreateReviewInput, userId: string) {
  const product = await products.findById(input.productId, { publicOnly: true });
  if (!product) throw ApiError.notFound("That product is no longer available.");

  const existing = await reviews.findByAuthor(input.productId, userId);
  const isVerifiedPurchase = await reviews.hasPurchased(userId, input.productId);

  const saved = await reviews.upsert({
    productId: product._id,
    userId: userId as never,
    rating: input.rating,
    title: input.title,
    body: input.body,
    images: input.images as never,
    isVerifiedPurchase,
  });

  // The upsert lands APPROVED whether this is a first submission or an edit,
  // so the product's rating is stale by one review either way until this runs.
  await refreshProductRating(String(product._id));

  return {
    review: saved,
    replacedExisting: Boolean(existing),
    status: "APPROVED" as const,
  };
}

export async function moderateReview(
  id: string,
  input: { status: "APPROVED" | "REJECTED"; rejectionReason?: string },
  moderatorId: string,
) {
  const review = await reviews.findById(id);
  if (!review) throw ApiError.notFound("We could not find that review.");

  const updated = await reviews.moderate(id, { ...input, moderatedBy: moderatorId });
  if (!updated) throw ApiError.notFound("We could not find that review.");

  // Either direction changes what counts: approving adds a rating, rejecting a
  // previously approved one takes it away.
  await refreshProductRating(String(review.productId));

  return updated;
}

export async function replyToReview(id: string, body: string, staffId: string) {
  const updated = await reviews.reply(id, body, staffId);
  if (!updated) throw ApiError.notFound("We could not find that review.");
  return updated;
}

export async function markHelpful(id: string, userId: string) {
  const updated = await reviews.markHelpful(id, userId);

  // Null means the row did not match — already marked by this account. Not an
  // error worth showing: the intent ("this was helpful") already holds.
  if (!updated) {
    const current = await reviews.findById(id);
    if (!current) throw ApiError.notFound("We could not find that review.");
    return { helpfulCount: current.helpfulCount, alreadyMarked: true };
  }

  return { helpfulCount: updated.helpfulCount, alreadyMarked: false };
}

export async function listForAdmin(options: {
  page: number;
  limit: number;
  status?: string;
  productId?: string;
  featured?: boolean;
  reported?: boolean;
}) {
  return reviews.listForAdmin(options);
}

/**
 * The homepage can hold this many testimonials before the grid starts to
 * look like a review page. Enforced here so the admin gets a clear message
 * rather than a silently truncated section.
 */
export const MAX_FEATURED_REVIEWS = 8;

/** Picks a review for the homepage, or takes it off. */
export async function setFeatured(id: string, isFeatured: boolean) {
  const review = await reviews.findById(id);
  if (!review) throw ApiError.notFound("We could not find that review.");

  if (isFeatured) {
    if (review.status !== "APPROVED") {
      throw ApiError.badRequest("Only approved reviews can be shown on the homepage.");
    }
    if (!review.body?.trim()) {
      throw ApiError.badRequest("This review has no text to quote on the homepage.");
    }
    if (!review.isFeatured && (await reviews.countFeatured()) >= MAX_FEATURED_REVIEWS) {
      throw ApiError.badRequest(
        `The homepage already shows ${MAX_FEATURED_REVIEWS} reviews. Remove one before adding another.`,
      );
    }
  }

  const updated = await reviews.setFeatured(id, isFeatured);
  if (!updated) throw ApiError.notFound("We could not find that review.");
  return updated;
}

/** The public homepage section: featured reviews plus the store-wide rating. */
export async function listFeatured() {
  const [items, summary] = await Promise.all([
    reviews.listFeatured(MAX_FEATURED_REVIEWS),
    reviews.overallRating(),
  ]);
  return { items, summary };
}

export async function listForUser(userId: string, options: { page: number; limit: number }) {
  return reviews.listForUser(userId, options);
}

/**
 * Withdraws a customer's own review.
 *
 * Ownership is checked here rather than relegated to the query filter — the
 * distinction between "no such review" and "not yours" doesn't matter to the
 * response (both are a plain 404, so a customer can't probe which reviews
 * exist under someone else's id), but it matters to this function reading
 * correctly as "you may only delete what you wrote."
 */
export async function deleteReview(id: string, userId: string) {
  const review = await reviews.findById(id);
  if (!review || String(review.userId) !== userId) {
    throw ApiError.notFound("We could not find that review.");
  }

  await reviews.remove(id);

  // An approved review counted toward the product's average; an unpublished
  // one never did, so only that case needs the rating recomputed.
  if (review.status === "APPROVED") {
    await refreshProductRating(String(review.productId));
  }

  return { deleted: true };
}

/**
 * A customer reports a review (App Store guideline 1.2). The review disappears
 * for the reporter straight away (see `listApproved`) and lands in the admin's
 * "Reported" filter; staff are emailed so they can act within 24 hours.
 */
export async function reportReview(id: string, userId: string, input: ReportReviewInput) {
  const review = await reviews.findById(id);
  if (!review) throw ApiError.notFound("We could not find that review.");

  if (String(review.userId) === userId) {
    throw ApiError.badRequest("You can't report your own review. You can delete it from My reviews.");
  }

  const updated = await reviews.addReport(id, { userId, reason: input.reason, details: input.details });
  if (!updated) return { reported: true, alreadyReported: true };

  const to = reviewReportsEmail();
  if (to) {
    const product = await products.findById(String(review.productId));
    queueMail({
      to,
      ...reviewReportedEmail({
        productTitle: product?.title ?? "a product",
        reason: input.reason,
        details: input.details,
        reviewText: [review.title, review.body].filter(Boolean).join(" — "),
        reportCount: updated.reportCount,
      }),
    });
  }

  return { reported: true, alreadyReported: false };
}

/**
 * A customer blocks a review's author: none of that person's reviews are
 * shown to them again. Takes the review id, so no user id is ever exposed.
 */
export async function blockReviewAuthor(id: string, userId: string) {
  const review = await reviews.findById(id);
  if (!review) throw ApiError.notFound("We could not find that review.");

  if (String(review.userId) === userId) {
    throw ApiError.badRequest("You can't block yourself.");
  }

  await users.addBlockedUser(userId, String(review.userId));
  return { blocked: true };
}

/** Account erasure: removes every review this customer wrote and fixes ratings. */
export async function removeAllForUser(userId: string) {
  const productIds = await reviews.removeAllByAuthor(userId);
  for (const productId of productIds) {
    await refreshProductRating(productId);
  }
}

// ---------------------------------------------------------------------------

/** Writes the derived rating back onto the product the storefront reads. */
async function refreshProductRating(productId: string): Promise<void> {
  const rating = await reviews.ratingFor(productId);
  await ProductModel.updateOne({ _id: productId }, { $set: rating });
}
