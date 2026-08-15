import { ApiError } from "@/lib/api/errors";
import * as reviews from "@/repositories/review.repository";
import * as products from "@/repositories/product.repository";
import { ProductModel } from "@/models/Product";
import type {
  CreateReviewInput,
  ListReviewsQuery,
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

export async function listForProduct(slug: string, query: ListReviewsQuery) {
  const product = await products.findBySlug(slug, { publicOnly: true });
  if (!product) throw ApiError.notFound("We could not find that product.");

  const { items, total } = await reviews.listApproved(String(product._id), query);

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
}) {
  return reviews.listForAdmin(options);
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

// ---------------------------------------------------------------------------

/** Writes the derived rating back onto the product the storefront reads. */
async function refreshProductRating(productId: string): Promise<void> {
  const rating = await reviews.ratingFor(productId);
  await ProductModel.updateOne({ _id: productId }, { $set: rating });
}
