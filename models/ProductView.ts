import mongoose, { type Model, type Types } from "mongoose";
import { defineModel } from "@/models/base";

/**
 * One product-page visit.
 *
 * An event row per view rather than a `viewCount` on the product, because a
 * counter answers only "how many, ever". The dashboard needs "how many this
 * month vs last", "how many *people*", and "of those, how many bought" — all
 * of which need the visits themselves, with a time and a visitor.
 *
 * `visitorId` is an opaque random id the storefront mints once per browser
 * and keeps in local storage. It is not a fingerprint and not tied to an
 * account; a signed-in customer also carries `userId`. Nothing identifying is
 * stored beyond that — no IP, no user agent.
 *
 * Rows expire after `RETENTION_DAYS`. The dashboard reads 60 days at most, and
 * a store doing a few thousand views a day would otherwise grow this into the
 * largest collection in the database within a year for no analytical gain.
 */

export const RETENTION_DAYS = 180;

export interface ProductViewDocument {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  /** Kept so a view of a since-deleted product still reads back with a name. */
  productSlug: string;
  visitorId: string;
  userId?: Types.ObjectId;
  /** Hostname the visitor came from, when the browser shared one. */
  referrerHost?: string;
  viewedAt: Date;
}

const productViewSchema = new mongoose.Schema<ProductViewDocument>(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productSlug: { type: String, required: true, trim: true },
    visitorId: { type: String, required: true, trim: true, maxlength: 64 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    referrerHost: { type: String, trim: true, maxlength: 253 },
    viewedAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

/** Per-product traffic over time — the dashboard's main read. */
productViewSchema.index({ productId: 1, viewedAt: -1 });

/** The dedupe lookup: has this visitor seen this product in the last N minutes? */
productViewSchema.index({ visitorId: 1, productId: 1, viewedAt: -1 });

/** Site-wide daily series, and the TTL that keeps the collection bounded. */
productViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

export const ProductViewModel: Model<ProductViewDocument> = defineModel(
  "ProductView",
  productViewSchema,
);
