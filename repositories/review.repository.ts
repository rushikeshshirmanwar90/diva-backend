import mongoose, { type PipelineStage } from "mongoose";
import { ReviewModel, type ReviewDocument } from "@/models/Review";
import { OrderModel } from "@/models/Order";
import type { ListReviewsQuery } from "@/validators/review";

/**
 * Review persistence.
 *
 * Reads for the product page are always constrained to `APPROVED` here rather
 * than at the call site — a listing that forgets the filter would publish
 * unmoderated text, which is the one mistake this collection must not allow.
 */

const SORTS: Record<ListReviewsQuery["sort"], Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  highest: { rating: -1, createdAt: -1 },
  lowest: { rating: 1, createdAt: -1 },
  helpful: { helpfulCount: -1, createdAt: -1 },
};

export async function findById(id: string) {
  return ReviewModel.findById(id).lean();
}

export async function findByAuthor(productId: string, userId: string) {
  return ReviewModel.findOne({ productId, userId }).lean();
}

/**
 * Approved reviews for one product, with the author's name joined in.
 *
 * The name is looked up rather than stored on the review so that a customer who
 * corrects their profile is not left with the old spelling under every review
 * they have written.
 */
export async function listApproved(productId: string, query: ListReviewsQuery) {
  const match = {
    productId: new mongoose.Types.ObjectId(productId),
    status: "APPROVED" as const,
  };

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $sort: SORTS[query.sort] },
    { $skip: (query.page - 1) * query.limit },
    { $limit: query.limit },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "author",
        // Only the name: a review must never leak the reviewer's email.
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    {
      $project: {
        rating: 1,
        title: 1,
        body: 1,
        images: 1,
        isVerifiedPurchase: 1,
        helpfulCount: 1,
        reply: 1,
        createdAt: 1,
        authorName: { $ifNull: [{ $first: "$author.name" }, "Diva customer"] },
      },
    },
  ];

  const [items, total] = await Promise.all([
    ReviewModel.aggregate(pipeline),
    ReviewModel.countDocuments(match),
  ]);

  return { items, total };
}

/**
 * A customer's own reviews, across every product — including PENDING and
 * REJECTED, which `listApproved` must never show a stranger but which the
 * author has every right to see.
 */
export async function listForUser(userId: string, options: { page: number; limit: number }) {
  const filter = { userId };

  const [items, total] = await Promise.all([
    ReviewModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate("productId", "title slug images")
      .lean(),
    ReviewModel.countDocuments(filter),
  ]);

  return { items, total };
}

/** Hard delete — reviews carry no `deletedAt`; a withdrawn review simply stops existing. */
export async function remove(id: string) {
  return ReviewModel.findByIdAndDelete(id).lean();
}

export async function listForAdmin(options: {
  page: number;
  limit: number;
  status?: string;
  productId?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (options.status) filter.status = options.status;
  if (options.productId) filter.productId = options.productId;

  const [items, total] = await Promise.all([
    ReviewModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate("userId", "name email")
      .populate("productId", "title slug")
      .lean(),
    ReviewModel.countDocuments(filter),
  ]);

  return { items, total };
}

/**
 * Creates or replaces this customer's review of this product.
 *
 * An upsert rather than an insert, because the unique `(productId, userId)`
 * index means a second submission is an *edit*, not a duplicate — and a plain
 * insert would surface that as a driver-level conflict the customer cannot act
 * on. Re-reviewing re-approves: edited text is live immediately, same as a
 * first submission, clearing any earlier moderation decision.
 */
export async function upsert(input: Partial<ReviewDocument>) {
  return ReviewModel.findOneAndUpdate(
    { productId: input.productId, userId: input.userId },
    { $set: { ...input, status: "APPROVED", moderatedBy: null, moderatedAt: null } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean();
}

export async function moderate(
  id: string,
  update: { status: string; rejectionReason?: string; moderatedBy: string },
) {
  return ReviewModel.findByIdAndUpdate(
    id,
    {
      $set: {
        status: update.status,
        rejectionReason: update.rejectionReason ?? null,
        moderatedBy: update.moderatedBy,
        moderatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  ).lean();
}

export async function reply(id: string, body: string, repliedBy: string) {
  return ReviewModel.findByIdAndUpdate(
    id,
    { $set: { reply: { body, repliedBy, repliedAt: new Date() } } },
    { returnDocument: "after" },
  ).lean();
}

/**
 * Marks a review helpful, once per account.
 *
 * `$addToSet` plus a count guarded by the same condition: the update only
 * applies when this user is not already in the list, so a double click cannot
 * inflate the number.
 */
export async function markHelpful(id: string, userId: string) {
  return ReviewModel.findOneAndUpdate(
    { _id: id, helpfulUserIds: { $ne: new mongoose.Types.ObjectId(userId) } },
    { $addToSet: { helpfulUserIds: userId }, $inc: { helpfulCount: 1 } },
    { returnDocument: "after" },
  ).lean();
}

/**
 * The product's rating, recomputed from its approved reviews.
 *
 * Derived rather than incremented: a counter drifts the first time a review is
 * rejected, edited or deleted, and a wrong average on a product page is both
 * visible and impossible to reconstruct after the fact.
 */
export async function ratingFor(productId: string) {
  const [result] = await ReviewModel.aggregate<{ avg: number; count: number }>([
    { $match: { productId: new mongoose.Types.ObjectId(productId), status: "APPROVED" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  return {
    // One decimal: the storefront renders "4.8", and storing more precision
    // than is ever displayed only invites two surfaces to round differently.
    ratingAvg: result ? Math.round(result.avg * 10) / 10 : 0,
    ratingCount: result?.count ?? 0,
  };
}

/**
 * Whether this customer has actually received this product.
 *
 * Only delivered orders count. An order that is paid but still in transit can
 * still be cancelled or returned, and a "verified purchase" badge on a piece
 * the reviewer has not held yet is exactly the claim the badge exists to deny.
 */
export async function hasPurchased(userId: string, productId: string): Promise<boolean> {
  const count = await OrderModel.countDocuments({
    userId,
    "items.productId": productId,
    status: "DELIVERED",
  });

  return count > 0;
}
