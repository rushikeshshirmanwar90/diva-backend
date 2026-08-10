import { z } from "zod";
import { objectId, pagination, imageInput } from "@/validators/common";
import { MODERATION_STATUSES } from "@/models/enums";

/**
 * Review input.
 *
 * Note what a caller **cannot** send: `userId`, `isVerifiedPurchase`, `status`
 * or `helpfulCount`. The author is taken from the session, the verified badge
 * is derived from their order history, and the status is decided by moderation.
 * Accepting any of those from the client would let anyone post a five-star
 * "verified" review as somebody else.
 */
export const createReviewSchema = z
  .object({
    productId: objectId,
    rating: z.number().int().min(1, "Choose a rating").max(5),
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().max(4000).optional(),
    images: z.array(imageInput).max(5).default([]),
  })
  .strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/** Public listing for a product page. Only approved reviews are ever returned. */
export const listReviewsSchema = z
  .object({
    ...pagination.shape,
    sort: z.enum(["newest", "highest", "lowest", "helpful"]).default("newest"),
  })
  .strict();

export type ListReviewsQuery = z.infer<typeof listReviewsSchema>;

/** The admin moderation queue, which is the only view that sees PENDING. */
export const listReviewsForAdminSchema = z
  .object({
    ...pagination.shape,
    status: z.enum(MODERATION_STATUSES).optional(),
    productId: objectId.optional(),
  })
  .strict();

export const moderateReviewSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"]),
    /** Recorded on a rejection so the decision is answerable later. */
    rejectionReason: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.status !== "REJECTED" || Boolean(value.rejectionReason), {
    message: "Give a reason when rejecting a review",
    path: ["rejectionReason"],
  });

export const replyToReviewSchema = z
  .object({ body: z.string().trim().min(1).max(2000) })
  .strict();
