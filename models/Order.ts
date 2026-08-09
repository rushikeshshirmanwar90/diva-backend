import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, paiseField } from "@/models/base";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  type OrderStatus,
  type PaymentMethod,
} from "@/models/enums";

/**
 * Orders.
 *
 * The governing rule of this collection: **an order snapshots everything it
 * depends on.** Product title, image, colour, size, unit price, the tax rate,
 * the shipping address, the coupon — all copied in at purchase time, none of it
 * joined to live data when the order is read back.
 *
 * This is not denormalisation for speed. It is correctness. If the order joined
 * to `Products` for a title, then renaming a product rewrites history; if it
 * joined for a price, then next month's price rise rewrites yesterday's
 * invoice. An invoice is a record of a completed transaction and must be
 * immutable — which also happens to be what tax law expects of it.
 */

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/**
 * A purchased line, frozen.
 *
 * `productId` and `variantId` are kept for reordering and analytics, but
 * nothing rendering this line may follow them.
 */
const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },

    title: { type: String, required: true },
    slug: { type: String, required: true },
    sku: { type: String, required: true },
    imageUrl: { type: String },

    colour: { type: String, required: true },
    size: { type: String },

    quantity: { type: Number, required: true, min: 1 },

    /** Per-unit price before tax and before order-level discounts. */
    unitPricePaise: paiseField({ required: true }),
    /** `unitPricePaise × quantity`. */
    lineSubtotalPaise: paiseField({ required: true }),
    /** This line's share of any order-level coupon. */
    lineDiscountPaise: paiseField({ default: 0 }),
    gstPercent: { type: Number, required: true },
    lineGstPaise: paiseField({ required: true }),
    lineTotalPaise: paiseField({ required: true }),

    hsnCode: { type: String },
  },
  { _id: false },
);

/** The delivery address as it was, not as it is now. */
const addressSnapshotSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    alternatePhone: { type: String },
    line1: { type: String, required: true },
    line2: { type: String },
    landmark: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, required: true, default: "India" },
  },
  { _id: false },
);

/**
 * A status change, with who and why.
 *
 * Every transition appends here. When a customer insists they were never told
 * their order was delayed, or an admin needs to know who cancelled what, this
 * array is the answer — and it is why status is never changed by a bare
 * `findByIdAndUpdate` scattered through the codebase.
 */
const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, required: true, default: () => new Date() },
    note: { type: String, maxlength: 500 },
    /** Absent when the transition came from a webhook rather than a person. */
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorRole: { type: String },
  },
  { _id: false },
);

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export interface OrderDocument {
  _id: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  /** Copied so order history survives a user changing their email. */
  customerEmail: string;
  customerPhone?: string;

  items: mongoose.InferSchemaType<typeof orderItemSchema>[];
  shippingAddress: mongoose.InferSchemaType<typeof addressSnapshotSchema>;
  billingAddress?: mongoose.InferSchemaType<typeof addressSnapshotSchema>;

  totals: {
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    gstPaise: number;
    /** What the customer is actually charged. Reconciled against the gateway. */
    grandTotalPaise: number;
  };

  coupon?: {
    code: string;
    type: string;
    value: number;
    discountPaise: number;
  } | null;

  status: OrderStatus;
  statusHistory: mongoose.InferSchemaType<typeof statusEventSchema>[];

  paymentMethod: PaymentMethod;
  paymentId?: Types.ObjectId;
  paidAt?: Date;

  shipmentId?: Types.ObjectId;

  /** Stock is held until this passes, then released by a sweep job. */
  reservationExpiresAt?: Date | null;

  cancelledAt?: Date;
  cancellationReason?: string;
  deliveredAt?: Date;

  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new mongoose.Schema<OrderDocument>(
  {
    /**
     * Human-readable, e.g. `DIVA-20260807-0042`.
     *
     * Customers read this out on the phone and paste it into support tickets;
     * an ObjectId is unusable for that. Unique because it is quoted as the
     * canonical reference on the invoice.
     */
    orderNumber: { type: String, required: true, trim: true, uppercase: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    customerEmail: { type: String, required: true, lowercase: true, trim: true },
    customerPhone: { type: String, trim: true },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "An order must contain at least one item",
      },
    },

    shippingAddress: { type: addressSnapshotSchema, required: true },
    billingAddress: { type: addressSnapshotSchema },

    totals: {
      subtotalPaise: paiseField({ required: true }),
      discountPaise: paiseField({ default: 0 }),
      shippingPaise: paiseField({ default: 0 }),
      gstPaise: paiseField({ required: true }),
      grandTotalPaise: paiseField({ required: true }),
    },

    coupon: {
      type: new mongoose.Schema(
        {
          code: { type: String, required: true },
          type: { type: String, required: true },
          value: { type: Number, required: true },
          discountPaise: paiseField({ required: true }),
        },
        { _id: false },
      ),
      default: null,
    },

    status: { type: String, enum: ORDER_STATUSES, default: "PENDING", required: true },
    statusHistory: { type: [statusEventSchema], default: [] },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "PHONEPE" },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    paidAt: { type: Date },

    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Shipment" },

    reservationExpiresAt: { type: Date, default: null },

    cancelledAt: { type: Date },
    cancellationReason: { type: String, maxlength: 500 },
    deliveredAt: { type: Date },

    notes: { type: String, maxlength: 1000 },
  },
  baseSchemaOptions,
);

orderSchema.index({ orderNumber: 1 }, { unique: true });

/** Customer order history: their orders, newest first. */
orderSchema.index({ userId: 1, createdAt: -1 });

/** Admin queues, filtered by status. */
orderSchema.index({ status: 1, createdAt: -1 });

/** Feeds the sweep that releases stock from checkouts that were abandoned. */
orderSchema.index({ status: 1, reservationExpiresAt: 1 });

/** Sales reporting over a date range. */
orderSchema.index({ createdAt: -1, status: 1 });

export const OrderModel: Model<OrderDocument> = defineModel("Order", orderSchema);
