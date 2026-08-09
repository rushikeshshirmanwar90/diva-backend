import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, paiseField } from "@/models/base";

/**
 * Shopping carts, for both signed-in customers and guests.
 *
 * Guest carts exist deliberately. Forcing a login before "add to cart" is a
 * large, repeatedly-measured conversion loss — the customer has to decide to
 * trust you before you have shown them anything. A guest cart is keyed by a
 * signed cookie token and merged into the user's cart at login.
 *
 * **What is stored, and what is not:** the cart holds product ids, variant ids
 * and quantities. It also holds a price snapshot, but that snapshot is a
 * *display* value only — every total that matters is recomputed server-side at
 * checkout from the live metal rate. A client-supplied or cart-stored total is
 * never trusted, because a cart row is trivially editable by whoever holds the
 * cookie.
 */

export interface CartItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  quantity: number;
  /**
   * Unit price when the item was added, in paise.
   *
   * Kept so the UI can say "the price of this item changed since you added it"
   * rather than silently charging more — with rate-based pricing that is a real
   * and frequent event, not an edge case.
   */
  addedAtPricePaise: number;
  addedAt: Date;
}

const cartItemSchema = new mongoose.Schema<CartItem>(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1, max: 20 },
    addedAtPricePaise: paiseField({ required: true }),
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

export interface CartDocument {
  _id: Types.ObjectId;
  userId?: Types.ObjectId | null;
  /** Opaque token from a signed cookie, for carts with no account yet. */
  guestToken?: string | null;
  items: CartItem[];
  couponCode?: string | null;
  /**
   * Guest carts expire; user carts do not (`expiresAt` stays null).
   *
   * A signed-in customer's cart persisting for months is a feature — they
   * return on another device and their basket is intact. An anonymous cart
   * behind a cookie nobody will present again is just rows.
   */
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const cartSchema = new mongoose.Schema<CartDocument>(
  {
    // No `sparse` here: an index option in a field definition *is* an index
    // declaration, and it would collide with the unique+sparse pair declared
    // below under the same auto-generated name.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    guestToken: { type: String, default: null },
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String, uppercase: true, trim: true, default: null },
    expiresAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

/** One cart per user, one per guest token. Both sparse — each cart has one or the other. */
cartSchema.index({ userId: 1 }, { unique: true, sparse: true });
cartSchema.index({ guestToken: 1 }, { unique: true, sparse: true });

/**
 * TTL sweep for abandoned guest carts.
 *
 * `expireAfterSeconds: 0` deletes a document once `expiresAt` passes. User
 * carts set it to null, and Mongo's TTL monitor ignores documents whose TTL
 * field is missing or not a date — so the same index safely covers both kinds.
 */
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CartModel: Model<CartDocument> = defineModel("Cart", cartSchema);
