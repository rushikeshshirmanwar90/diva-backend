import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, paiseField } from "@/models/base";
import {
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  type PaymentStatus,
  type PaymentMethod,
} from "@/models/enums";

/**
 * Payment attempts.
 *
 * This is the one collection where a bug costs money directly, so it is built
 * defensively:
 *
 * - **`merchantTransactionId` is uniquely indexed.** That index is the
 *   duplicate-payment guard. Webhooks are re-delivered by design, and the
 *   correct defence is not "check whether we already processed it" — that is a
 *   read-then-write race — but an atomic conditional update against a unique
 *   key, so the second delivery loses at the database level.
 *
 * - **Every callback is logged verbatim before it is parsed.** `rawCallbacks`
 *   is the evidence you produce when disputing a transaction with the gateway.
 *   Reconstructing it after the fact is impossible.
 *
 * - **Amount is reconciled, never assumed.** If the gateway confirms an amount
 *   that differs from the order total, the order does not get fulfilled — it
 *   gets flagged. `amountMismatch` records that.
 *
 * - **Refund fields exist from day one**, even though refunds ship later.
 *   Retrofitting them means reconstructing gateway references for historical
 *   payments, which is exactly the work nobody has time for during a refund
 *   dispute.
 */

const callbackSchema = new mongoose.Schema(
  {
    receivedAt: { type: Date, required: true, default: () => new Date() },
    /** `WEBHOOK`, `CHECK_STATUS`, `REDIRECT`. */
    source: { type: String, required: true },
    /** Whether the signature check passed. Unverified payloads are stored too. */
    signatureValid: { type: Boolean },
    /** The body exactly as received. Never normalised. */
    payload: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

export interface PaymentDocument {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  userId: Types.ObjectId;

  /** Our reference, sent to the gateway. The idempotency key. */
  merchantTransactionId: string;
  /** The gateway's reference, returned on success. */
  phonePeTransactionId?: string;

  method: PaymentMethod;
  status: PaymentStatus;

  /** What we asked for, in paise. */
  amountPaise: number;
  /** What the gateway says was actually paid. */
  confirmedAmountPaise?: number;
  /** True when the two disagree. Blocks fulfilment; needs manual review. */
  amountMismatch: boolean;

  paymentInstrument?: string;
  failureCode?: string;
  failureMessage?: string;

  initiatedAt: Date;
  completedAt?: Date;
  /** Last time the reconciliation job asked the gateway about this payment. */
  lastCheckedAt?: Date;
  checkAttempts: number;

  refundedAmountPaise: number;
  refunds: {
    refundId: string;
    amountPaise: number;
    status: string;
    reason?: string;
    createdAt: Date;
  }[];

  rawCallbacks: mongoose.InferSchemaType<typeof callbackSchema>[];

  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new mongoose.Schema<PaymentDocument>(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    merchantTransactionId: { type: String, required: true, trim: true },
    /** Indexed once, below — not here; two declarations collide by name. */
    phonePeTransactionId: { type: String, trim: true },

    method: { type: String, enum: PAYMENT_METHODS, default: "PHONEPE" },
    status: { type: String, enum: PAYMENT_STATUSES, default: "INITIATED", required: true },

    amountPaise: paiseField({ required: true }),
    confirmedAmountPaise: paiseField(),
    amountMismatch: { type: Boolean, default: false },

    paymentInstrument: { type: String, trim: true },
    failureCode: { type: String, trim: true },
    failureMessage: { type: String, trim: true, maxlength: 500 },

    initiatedAt: { type: Date, required: true, default: () => new Date() },
    completedAt: { type: Date },
    lastCheckedAt: { type: Date },
    checkAttempts: { type: Number, default: 0 },

    refundedAmountPaise: paiseField({ default: 0 }),
    refunds: {
      type: [
        new mongoose.Schema(
          {
            refundId: { type: String, required: true },
            amountPaise: paiseField({ required: true }),
            status: { type: String, required: true },
            reason: { type: String, maxlength: 500 },
            createdAt: { type: Date, default: () => new Date() },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    rawCallbacks: { type: [callbackSchema], default: [] },
  },
  baseSchemaOptions,
);

/** The duplicate-payment guard. Do not remove this index. */
paymentSchema.index({ merchantTransactionId: 1 }, { unique: true });
paymentSchema.index({ phonePeTransactionId: 1 }, { sparse: true });

/**
 * Feeds the reconciliation job.
 *
 * That job sweeps payments stuck in INITIATED for over 15 minutes and asks the
 * gateway what happened. Webhooks get lost — networks fail, the server restarts
 * mid-request — and without this sweep those orders sit in limbo forever while
 * the customer's card has already been charged. It is part of a correct
 * integration, not optional polish.
 */
paymentSchema.index({ status: 1, initiatedAt: 1 });

/** Surfaces payments needing human attention. */
paymentSchema.index({ amountMismatch: 1, status: 1 });

export const PaymentModel: Model<PaymentDocument> = defineModel("Payment", paymentSchema);
