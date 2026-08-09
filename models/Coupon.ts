import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, paiseField } from "@/models/base";
import { COUPON_TYPES, type CouponType } from "@/models/enums";

/**
 * Discount coupons.
 *
 * `usedCount` is incremented with an atomic `$inc` guarded by a conditional
 * filter (`usedCount < usageLimit`), never read-then-written. On a flash sale
 * the same code is redeemed concurrently by dozens of customers, and a
 * read-then-write lets a limited-to-100 coupon be used several hundred times —
 * a real, direct revenue loss that only shows up in reconciliation.
 */

export interface CouponDocument {
  _id: Types.ObjectId;
  code: string;
  description?: string;

  type: CouponType;
  /** Percent (10 = 10%) or paise (FLAT). Interpretation depends on `type`. */
  value: number;
  /** Ceiling for percentage coupons, so "20% off" cannot cost ₹40,000. */
  maxDiscountPaise?: number | null;
  minCartValuePaise: number;

  usageLimit?: number | null;
  usedCount: number;
  perUserLimit: number;

  /** When set, the coupon only applies to these products/categories. */
  applicableProductIds: Types.ObjectId[];
  applicableCategoryIds: Types.ObjectId[];
  excludedProductIds: Types.ObjectId[];

  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  /** Hidden codes are not listed in the UI but still redeemable if typed. */
  isPublic: boolean;

  createdBy?: Types.ObjectId;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new mongoose.Schema<CouponDocument>(
  {
    /**
     * Uppercased on write so `diwali20` and `DIWALI20` are the same coupon.
     * Customers type these from print and social posts, with arbitrary casing.
     */
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 32,
    },
    description: { type: String, trim: true, maxlength: 300 },

    type: { type: String, enum: COUPON_TYPES, required: true },
    value: { type: Number, required: true, min: 0 },
    maxDiscountPaise: { ...paiseField(), default: null },
    minCartValuePaise: paiseField({ default: 0 }),

    usageLimit: { type: Number, min: 1, default: null },
    usedCount: { type: Number, default: 0, min: 0 },
    perUserLimit: { type: Number, default: 1, min: 1 },

    applicableProductIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      default: [],
    },
    applicableCategoryIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      default: [],
    },
    excludedProductIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      default: [],
    },

    validFrom: { type: Date, required: true, default: () => new Date() },
    validTo: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, validFrom: 1, validTo: 1 });

/**
 * Percentage coupons above 100% are always a typo, and an expensive one — the
 * order total goes negative and the payment amount becomes nonsense.
 */
couponSchema.pre<mongoose.HydratedDocument<CouponDocument>>("validate", function validateCoupon() {
  if (this.type === "PERCENT" && this.value > 100) {
    this.invalidate("value", "A percentage discount cannot exceed 100", this.value);
  }
  if (this.validTo <= this.validFrom) {
    this.invalidate("validTo", "validTo must be after validFrom", this.validTo);
  }
});

export const CouponModel: Model<CouponDocument> = defineModel("Coupon", couponSchema);

/**
 * Per-user redemption ledger.
 *
 * Separate from the coupon so `perUserLimit` is enforceable without scanning
 * orders. The compound unique index makes a double redemption a database-level
 * failure rather than a check that can be raced.
 */
export interface CouponRedemptionDocument {
  _id: Types.ObjectId;
  couponId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  discountPaise: number;
  createdAt: Date;
  updatedAt: Date;
}

const redemptionSchema = new mongoose.Schema<CouponRedemptionDocument>(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    discountPaise: paiseField({ required: true }),
  },
  baseSchemaOptions,
);

redemptionSchema.index({ couponId: 1, orderId: 1 }, { unique: true });
redemptionSchema.index({ couponId: 1, userId: 1 });

export const CouponRedemptionModel: Model<CouponRedemptionDocument> = defineModel(
  "CouponRedemption",
  redemptionSchema,
);
