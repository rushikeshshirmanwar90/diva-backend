import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, imageSchema } from "@/models/base";
import type { ImageRef } from "@/models/base";
import {
  MODERATION_STATUSES,
  REVIEW_REPORT_REASONS,
  type ModerationStatus,
  type ReviewReportReason,
} from "@/models/enums";

/**
 * Product reviews.
 *
 * `orderId` is what makes a review verifiable: it proves the reviewer actually
 * bought the item. Reviews without it are still allowed but carry
 * `isVerifiedPurchase: false`, and the storefront says so. For jewellery, where
 * a single purchase is a significant sum, that badge does real work.
 *
 * Reviews default to APPROVED and are visible on the product page immediately —
 * moderation is opt-out (staff can still reject one after the fact via
 * `PATCH /admin/reviews/:id`) rather than opt-in.
 */

export interface ReviewReport {
  userId: Types.ObjectId;
  reason: ReviewReportReason;
  details?: string;
  createdAt: Date;
}

export interface ReviewDocument {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId?: Types.ObjectId;

  rating: number;
  title?: string;
  body?: string;
  images: ImageRef[];

  isVerifiedPurchase: boolean;
  status: ModerationStatus;
  moderatedBy?: Types.ObjectId;
  moderatedAt?: Date;
  rejectionReason?: string;

  /**
   * Hand-picked for the homepage's "What customers actually say" section.
   * Only ever shown while the review is also APPROVED — rejecting a featured
   * review pulls it off the homepage without staff needing to remember to
   * unfeature it as well.
   */
  isFeatured: boolean;

  helpfulCount: number;
  /** Prevents one account inflating a review's helpful count repeatedly. */
  helpfulUserIds: Types.ObjectId[];

  /**
   * Customer reports ("this review is offensive / spam"). One per account.
   * `reportCount` counts reports not yet dealt with: a moderation decision
   * resets it to 0, while `reports` keeps the history.
   */
  reports: ReviewReport[];
  reportCount: number;
  lastReportedAt?: Date;

  /** Seller reply, shown inline beneath the review. */
  reply?: {
    body: string;
    repliedBy: Types.ObjectId;
    repliedAt: Date;
  } | null;

  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new mongoose.Schema<ReviewDocument>(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 4000 },
    images: { type: [imageSchema], default: [] },

    isVerifiedPurchase: { type: Boolean, default: false },

    status: { type: String, enum: MODERATION_STATUSES, default: "APPROVED", required: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    moderatedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 300 },

    isFeatured: { type: Boolean, default: false },

    helpfulCount: { type: Number, default: 0, min: 0 },
    helpfulUserIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
      select: false,
    },

    reports: {
      type: [
        new mongoose.Schema(
          {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
            reason: { type: String, enum: REVIEW_REPORT_REASONS, required: true },
            details: { type: String, trim: true, maxlength: 500 },
            createdAt: { type: Date, default: () => new Date() },
          },
          { _id: false },
        ),
      ],
      default: [],
      select: false,
    },
    reportCount: { type: Number, default: 0, min: 0 },
    lastReportedAt: { type: Date },

    reply: {
      type: new mongoose.Schema(
        {
          body: { type: String, required: true, maxlength: 2000 },
          repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          repliedAt: { type: Date, default: () => new Date() },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  baseSchemaOptions,
);

/** One review per customer per product. Edits update; they do not accumulate. */
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

/** The product-page query: approved reviews for this product, newest first. */
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });

/** The moderation queue. */
reviewSchema.index({ status: 1, createdAt: 1 });

/** The homepage testimonials: featured and approved, newest first. */
reviewSchema.index({ isFeatured: 1, status: 1, createdAt: -1 });

/** The admin's "Reported" filter: open reports, most recent first. */
reviewSchema.index({ reportCount: 1, lastReportedAt: -1 });

export const ReviewModel: Model<ReviewDocument> = defineModel("Review", reviewSchema);
