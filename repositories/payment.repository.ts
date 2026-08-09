import { PaymentModel, type PaymentDocument } from "@/models/Payment";
import type { PaymentStatus } from "@/models/enums";
import type { Types } from "mongoose";

export async function create(input: Partial<PaymentDocument>) {
  const payment = await PaymentModel.create(input);
  return payment.toObject();
}

export async function findByMerchantTransactionId(merchantTransactionId: string) {
  return PaymentModel.findOne({ merchantTransactionId }).lean();
}

export async function findById(id: string | Types.ObjectId) {
  return PaymentModel.findById(id).lean();
}

export async function findLatestForOrder(orderId: string | Types.ObjectId) {
  return PaymentModel.findOne({ orderId }).sort({ createdAt: -1 }).lean();
}

/**
 * Records a gateway callback verbatim, before anything is parsed.
 *
 * Deliberately separate from `settle` and always called first, including when
 * verification failed and when the payload turns out to be unparseable. This
 * array is the evidence in a chargeback dispute; a payload that was rejected is
 * often the most interesting one to have kept.
 */
export async function appendCallback(
  merchantTransactionId: string,
  callback: { source: string; signatureValid?: boolean; payload: unknown },
) {
  return PaymentModel.updateOne(
    { merchantTransactionId },
    {
      $push: {
        rawCallbacks: {
          receivedAt: new Date(),
          source: callback.source,
          ...(callback.signatureValid === undefined
            ? {}
            : { signatureValid: callback.signatureValid }),
          payload: callback.payload,
        },
      },
      $set: { lastCheckedAt: new Date() },
    },
  );
}

/**
 * Settles a payment, once.
 *
 * The status filter is the duplicate-settlement guard. A webhook and the
 * reconciliation job can confirm the same payment within milliseconds of each
 * other; without the filter both would proceed to mark the order paid, create
 * two shipments and email the customer twice.
 *
 * Returns the updated document, or `null` when the payment was already
 * terminal — which the caller must treat as success-and-already-done, not as an
 * error. A webhook that 500s is a webhook PhonePe redelivers forever.
 */
export async function settle(
  merchantTransactionId: string,
  update: {
    status: PaymentStatus;
    phonePeTransactionId?: string;
    confirmedAmountPaise?: number;
    amountMismatch?: boolean;
    paymentInstrument?: string;
    failureCode?: string;
    failureMessage?: string;
  },
) {
  return PaymentModel.findOneAndUpdate(
    {
      merchantTransactionId,
      // Only a not-yet-final payment may be settled. SUCCESS, REFUNDED and
      // friends are end states.
      status: { $in: ["INITIATED", "PENDING"] },
    },
    {
      $set: {
        ...update,
        completedAt: new Date(),
        lastCheckedAt: new Date(),
      },
      $inc: { checkAttempts: 1 },
    },
    { returnDocument: "after" },
  ).lean();
}

export async function markPending(merchantTransactionId: string) {
  return PaymentModel.findOneAndUpdate(
    { merchantTransactionId, status: "INITIATED" },
    { $set: { status: "PENDING", lastCheckedAt: new Date() }, $inc: { checkAttempts: 1 } },
    { returnDocument: "after" },
  ).lean();
}

export async function recordRefund(
  paymentId: string | Types.ObjectId,
  refund: { refundId: string; amountPaise: number; status: string; reason?: string },
) {
  return PaymentModel.findByIdAndUpdate(
    paymentId,
    {
      $push: { refunds: { ...refund, createdAt: new Date() } },
      $inc: { refundedAmountPaise: refund.amountPaise },
      $set: { status: refund.status === "COMPLETED" ? "REFUNDED" : "REFUND_INITIATED" },
    },
    { returnDocument: "after" },
  ).lean();
}

/**
 * Payments stuck mid-flight, for the reconciliation sweep.
 *
 * Webhooks get lost. Networks partition, deploys restart the process mid
 * request, PhonePe has an incident. Without this sweep those orders sit
 * unfulfilled while the customer's money is gone — the single worst failure
 * mode this integration has, and the reason `checkAttempts` exists.
 */
export async function findStale(options: { olderThanMinutes: number; limit?: number }) {
  const cutoff = new Date(Date.now() - options.olderThanMinutes * 60_000);

  return PaymentModel.find({
    status: { $in: ["INITIATED", "PENDING"] },
    initiatedAt: { $lt: cutoff },
    // Give up after a day of asking; by then it is an operator's problem, and
    // an unbounded retry against a dead transaction is just noise.
    checkAttempts: { $lt: 48 },
  })
    .sort({ initiatedAt: 1 })
    .limit(options.limit ?? 50)
    .lean();
}

/** Payments where the gateway confirmed an amount we did not expect. */
export async function findMismatched(limit = 50) {
  return PaymentModel.find({ amountMismatch: true }).sort({ createdAt: -1 }).limit(limit).lean();
}
