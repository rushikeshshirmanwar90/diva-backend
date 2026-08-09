import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, paiseField } from "@/models/base";

/**
 * Saved items, one document per customer.
 *
 * A single document with an array rather than a row per saved product: the only
 * queries are "show me my wishlist" and "is this product in it", both of which
 * a single fetch answers. There is no meaningful "who else saved this" query
 * that would justify the row-per-item shape.
 *
 * `priceWhenAdded` exists so a price-drop notification is possible. With
 * rate-based pricing the number moves on its own, which makes "the ring you
 * saved is now ₹2,400 cheaper" a genuinely useful message rather than a
 * marketing fiction.
 */

export interface WishlistItem {
  productId: Types.ObjectId;
  variantId?: Types.ObjectId | null;
  priceWhenAddedPaise: number;
  notifyOnPriceDrop: boolean;
  addedAt: Date;
}

const wishlistItemSchema = new mongoose.Schema<WishlistItem>(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    priceWhenAddedPaise: paiseField({ default: 0 }),
    notifyOnPriceDrop: { type: Boolean, default: true },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

export interface WishlistDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  items: WishlistItem[];
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new mongoose.Schema<WishlistDocument>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [wishlistItemSchema], default: [] },
  },
  baseSchemaOptions,
);

wishlistSchema.index({ userId: 1 }, { unique: true });
/** Supports the price-drop sweep: which wishlists contain this product. */
wishlistSchema.index({ "items.productId": 1 });

export const WishlistModel: Model<WishlistDocument> = defineModel("Wishlist", wishlistSchema);
