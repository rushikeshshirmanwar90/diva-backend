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
 * Three rules live here and nowhere else:
 *
 *  1. **The author is the session, never the request.** Nothing a client sends
 *     decides who wrote a review.
 *  2. **"Verified purchase" is derived, never claimed.** It comes from the
 *     reviewer's own delivered orders.
 *  3. **Nothing is published unread.** Every submission lands `PENDING`, and a
 *     product's rating only counts approved reviews — so a spam five-star does
 *     not move the average while it sits in the queue.
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

  /**
   * An edit can pull an already-published review out of the average.
   *
   * The upsert resets status to PENDING, so if the previous version was
   * approved and counted, the product's rating is now stale by one review until
   * this is recomputed.
   */
  if (existing?.status === "APPROVED") {
    await refreshProductRating(String(product._id));
  }

  return {
    review: saved,
    replacedExisting: Boolean(existing),
    status: "PENDING" as const,
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

// ---------------------------------------------------------------------------

/** Writes the derived rating back onto the product the storefront reads. */
async function refreshProductRating(productId: string): Promise<void> {
  const rating = await reviews.ratingFor(productId);
  await ProductModel.updateOne({ _id: productId }, { $set: rating });
}
