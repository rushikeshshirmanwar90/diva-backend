import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ApiError } from "@/lib/api/errors";
import { env } from "@/config/env";
import * as phonepe from "@/lib/payments/phonepe";
import * as orders from "@/repositories/order.repository";
import * as payments from "@/repositories/payment.repository";
import * as orderService from "@/services/order.service";
import * as shippingService from "@/services/shipping.service";
import { CouponModel, CouponRedemptionModel } from "@/models/Coupon";
import type { OrderDocument } from "@/models/Order";
import type { PaymentDocument } from "@/models/Payment";

/**
 * Payment orchestration.
 *
 * Three things can tell us a payment succeeded, and this file treats them very
 * differently:
 *
 *   1. **The webhook** — PhonePe calling us. Authenticated, but the body is not
 *      signed, so it is treated as a *notification* and the outcome is re-read
 *      from the gateway.
 *   2. **The reconciliation sweep** — us calling PhonePe about payments stuck
 *      in flight. Authoritative. This is what saves orders when a webhook is
 *      lost, which happens.
 *   3. **The browser returning to our redirect URL** — a hint that the customer
 *      is back, and nothing more. It triggers a status *check*; it never
 *      confirms anything by itself. The URL is fully under the customer's
 *      control.
 *
 * All three funnel into `settleFromGateway`, which is written to be safe when
 * called concurrently and repeatedly, because it will be.
 */

// ---------------------------------------------------------------------------
// Initiation
// ---------------------------------------------------------------------------

export type InitiateResult = {
  merchantTransactionId: string;
  redirectUrl: string;
  orderNumber: string;
  amountPaise: number;
};

/**
 * Starts a payment for an order the customer owns.
 *
 * A fresh `merchantTransactionId` is minted per attempt. Reusing one across
 * retries is rejected by PhonePe as a duplicate, so a customer whose first
 * attempt failed could never try again — and the unique index on that column,
 * which is the duplicate-payment guard, would be doing nothing.
 */
export async function initiatePayment(
  orderNumber: string,
  actor: { userId: string },
): Promise<InitiateResult> {
  const order = await orders.findOwnedByNumber(orderNumber, actor.userId);
  if (!order) throw ApiError.notFound("We could not find that order.");

  if (order.status !== "PENDING" && order.status !== "PAYMENT_FAILED") {
    throw ApiError.conflict(
      order.status === "PAYMENT_SUCCESS" || order.status === "CONFIRMED"
        ? "This order has already been paid for."
        : "This order can no longer be paid for. Please start a new order.",
    );
  }

  if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) {
    throw ApiError.conflict(
      "The price hold on this order has expired. Please place it again to get the current rate.",
    );
  }

  const merchantTransactionId = buildTransactionId(order.orderNumber);
  const amountPaise = order.totals.grandTotalPaise;

  /**
   * The Payment row is written **before** PhonePe is called.
   *
   * If the call to PhonePe succeeds but our process dies before we could
   * persist anything, a customer has paid against a transaction id we have no
   * record of — unreconcilable without reading their dashboard by hand.
   * Recording first means the worst case is an orphan INITIATED row, which the
   * sweep resolves on its own.
   */
  const payment = await payments.create({
    orderId: order._id,
    userId: new mongoose.Types.ObjectId(actor.userId),
    merchantTransactionId,
    method: "PHONEPE",
    status: "INITIATED",
    amountPaise,
    initiatedAt: new Date(),
  });

  await orders.attachPayment(order._id, payment._id);

  const initiated = await phonepe.initiatePayment({
    merchantOrderId: merchantTransactionId,
    amountPaise,
    // PhonePe returns the customer to the storefront, not to this API. The
    // page there polls our status endpoint; it is not itself trusted.
    redirectUrl: `${env.STOREFRONT_URL}/checkout/payment-return?ref=${merchantTransactionId}`,
    message: `Diva order ${order.orderNumber}`,
    metaInfo: { udf1: order.orderNumber },
  });

  /**
   * PENDING only after the gateway has accepted the request. Ordering matters:
   * a transition to PAYMENT_INITIATED before the call would leave an order
   * claiming a payment is in flight when the gateway never accepted one.
   */
  await orders.transition(order._id, "PAYMENT_INITIATED", ["PENDING", "PAYMENT_FAILED"], {
    note: `Payment initiated (${merchantTransactionId})`,
  });

  return {
    merchantTransactionId,
    redirectUrl: initiated.redirectUrl,
    orderNumber: order.orderNumber,
    amountPaise,
  };
}

// ---------------------------------------------------------------------------
// Status, webhook, reconciliation
// ---------------------------------------------------------------------------

export type PaymentView = {
  merchantTransactionId: string;
  orderNumber: string;
  status: PaymentDocument["status"];
  orderStatus: OrderDocument["status"];
  amountPaise: number;
  failureMessage?: string;
};

/**
 * Reads the live status from PhonePe and settles if it has resolved.
 *
 * This is what the return page polls. It is a gateway call rather than a
 * database read on purpose: the customer arrives back at this page within a
 * second or two of paying, typically before the webhook lands.
 */
export async function checkStatus(
  merchantTransactionId: string,
  actor: { userId: string },
): Promise<PaymentView> {
  const payment = await payments.findByMerchantTransactionId(merchantTransactionId);

  if (!payment || String(payment.userId) !== actor.userId) {
    // Same 404 for "no such payment" and "not yours" — see the note in
    // order.repository about not confirming references to a prober.
    throw ApiError.notFound("We could not find that payment.");
  }

  if (payment.status !== "INITIATED" && payment.status !== "PENDING") {
    return view(payment, await orders.findById(String(payment.orderId)));
  }

  const status = await phonepe.fetchOrderStatus(merchantTransactionId);

  await payments.appendCallback(merchantTransactionId, {
    source: "CHECK_STATUS",
    payload: status.raw,
  });

  const settled = await settleFromGateway(merchantTransactionId, status);

  return view(
    settled ?? payment,
    await orders.findById(String(payment.orderId)),
  );
}

/**
 * Handles a PhonePe webhook.
 *
 * Returns 200 for everything it can parse, including events it ignores and
 * payments it has already settled. A non-2xx makes PhonePe redeliver, and
 * redelivering a message we handled correctly is pure load — the only
 * legitimate reasons to fail are a bad signature (401) and an unparseable body.
 */
export async function handleWebhook(input: {
  authorizationHeader: string | null;
  rawBody: string;
}): Promise<{ handled: boolean; reason?: string }> {
  const signatureValid = phonepe.verifyWebhookAuth(input.authorizationHeader);

  let body: { event?: string; payload?: { merchantOrderId?: string } };
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    throw ApiError.badRequest("Webhook body is not valid JSON");
  }

  const merchantTransactionId = body.payload?.merchantOrderId;

  /**
   * Log the delivery before judging it — including when the signature failed.
   *
   * A run of rejected callbacks is exactly what you want to see when the
   * dashboard credentials were rotated and nobody updated `.env`. Discarding
   * them leaves a silent outage where orders simply stop being confirmed.
   */
  if (merchantTransactionId) {
    await payments.appendCallback(merchantTransactionId, {
      source: "WEBHOOK",
      signatureValid,
      payload: body,
    });
  }

  if (!signatureValid) {
    throw ApiError.unauthenticated("Invalid webhook signature");
  }

  if (!merchantTransactionId) {
    return { handled: false, reason: "No merchantOrderId in payload" };
  }

  if (body.event && !phonepe.HANDLED_EVENTS.has(body.event)) {
    return { handled: false, reason: `Ignoring event ${body.event}` };
  }

  /**
   * The webhook body is discarded as a source of truth here.
   *
   * PhonePe does not sign it, so all the `Authorization` header proves is that
   * the caller knows a shared secret — it says nothing about whether the body
   * was modified in transit or replayed with an edited amount. Re-reading from
   * the API costs one round trip and removes the entire question.
   */
  const status = await phonepe.fetchOrderStatus(merchantTransactionId);

  await settleFromGateway(merchantTransactionId, status);

  return { handled: true };
}

/**
 * The reconciliation sweep. Run it on a schedule, every few minutes.
 *
 * Not optional polish. Webhooks are lost often enough that without this, a
 * predictable trickle of customers pay and never receive their order — and the
 * first you hear of it is a support ticket, days later.
 */
export async function reconcileStalePayments(options: { olderThanMinutes?: number } = {}) {
  const stale = await payments.findStale({
    olderThanMinutes: options.olderThanMinutes ?? 15,
  });

  const results = { checked: 0, settled: 0, failed: 0 };

  for (const payment of stale) {
    results.checked += 1;

    try {
      const status = await phonepe.fetchOrderStatus(payment.merchantTransactionId);

      await payments.appendCallback(payment.merchantTransactionId, {
        source: "CHECK_STATUS",
        payload: status.raw,
      });

      const settled = await settleFromGateway(payment.merchantTransactionId, status);
      if (settled) results.settled += 1;
    } catch (error) {
      results.failed += 1;
      console.error(
        `[payment] Reconciliation failed for ${payment.merchantTransactionId}`,
        error,
      );
    }
  }

  return results;
}

/**
 * Applies a gateway outcome to the payment and its order. Idempotent.
 *
 * Every mutation below is guarded by the state it expects, so a second
 * concurrent call finds nothing to update and returns null rather than
 * double-confirming, double-committing stock, or double-shipping.
 */
async function settleFromGateway(
  merchantTransactionId: string,
  status: phonepe.GatewayStatus,
) {
  if (status.status === "PENDING") {
    await payments.markPending(merchantTransactionId);
    return null;
  }

  const existing = await payments.findByMerchantTransactionId(merchantTransactionId);
  if (!existing) return null;

  /**
   * Amount reconciliation.
   *
   * The gateway is asked what was paid and it is compared against what we
   * charged. A mismatch is flagged and fulfilment stops — it means either a
   * tampered request or a bug in our own totalling, and shipping gold against
   * either is the expensive mistake.
   */
  const confirmedAmountPaise = status.amountPaise;
  const amountMismatch =
    status.status === "SUCCESS" &&
    confirmedAmountPaise != null &&
    confirmedAmountPaise !== existing.amountPaise;

  const settled = await payments.settle(merchantTransactionId, {
    status: status.status,
    phonePeTransactionId: status.transactionId,
    confirmedAmountPaise,
    amountMismatch,
    paymentInstrument: status.instrument,
    failureCode: status.errorCode,
    failureMessage: status.errorMessage,
  });

  // Already terminal — another webhook or the sweep got here first.
  if (!settled) return existing;

  const order = await orders.findById(String(settled.orderId));
  if (!order) return settled;

  if (status.status === "FAILED") {
    await orders.transition(order._id, "PAYMENT_FAILED", "PAYMENT_INITIATED", {
      note: status.errorMessage ?? "Payment failed at the gateway",
    });

    /**
     * Stock stays held on failure, until `reservationExpiresAt` lapses.
     *
     * Releasing immediately would be worse: the commonest reason a payment
     * fails is a customer picking the wrong UPI app, and they retry within
     * seconds. Losing their item in that window turns a recoverable failure
     * into a lost sale.
     */
    return settled;
  }

  if (amountMismatch) {
    /**
     * Paid, but for the wrong amount. The order is *not* confirmed. It stops at
     * PAYMENT_SUCCESS with a note, which is where the admin mismatch queue
     * picks it up. Automatic refunds are not attempted — a human decides.
     */
    await orders.transition(order._id, "PAYMENT_SUCCESS", "PAYMENT_INITIATED", {
      note:
        `Amount mismatch: charged ${existing.amountPaise} paise, ` +
        `gateway confirmed ${confirmedAmountPaise}. Held for review.`,
      set: { paidAt: new Date(), reservationExpiresAt: null },
    });

    console.error(
      `[payment] AMOUNT MISMATCH on ${merchantTransactionId}: ` +
        `expected ${existing.amountPaise}, got ${confirmedAmountPaise}`,
    );

    return settled;
  }

  // --- The happy path ------------------------------------------------------

  const paid = await orders.transition(order._id, "PAYMENT_SUCCESS", "PAYMENT_INITIATED", {
    note: `Payment confirmed (${status.transactionId ?? merchantTransactionId})`,
    set: { paidAt: new Date(), reservationExpiresAt: null },
  });

  // Another caller already advanced it. Everything below has run once already.
  if (!paid) return settled;

  await orderService.commitStockForOrder(order);
  await redeemCoupon(order);

  const confirmed = await orders.transition(order._id, "CONFIRMED", "PAYMENT_SUCCESS", {
    note: "Order confirmed",
  });

  /**
   * Shipment creation is deliberately best-effort.
   *
   * Shiprocket being down must not fail a webhook — the customer has paid, the
   * order is confirmed, and that must be recorded regardless. A failure here
   * leaves the order CONFIRMED, which is exactly the queue an operator works
   * from, and `createShipmentForOrder` is safe to retry.
   */
  if (confirmed) {
    try {
      await shippingService.createShipmentForOrder(String(order._id));
    } catch (error) {
      console.error(
        `[payment] Shipment creation failed for ${order.orderNumber}; order left CONFIRMED`,
        error,
      );
    }
  }

  return settled;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/**
 * Refunds a paid order, in full or in part.
 *
 * Staff-only, behind `payment:refund`. There is no customer-facing path to this
 * for a good reason: a self-service refund button on a jewellery store is an
 * invitation to pay, receive, and refund.
 */
export async function refundOrder(input: {
  orderNumber: string;
  amountPaise?: number;
  reason?: string;
  actorId: string;
}) {
  const order = await orders.findByNumber(input.orderNumber);
  if (!order) throw ApiError.notFound("We could not find that order.");

  const payment = await payments.findLatestForOrder(order._id);

  if (!payment || payment.status !== "SUCCESS") {
    throw ApiError.conflict("There is no captured payment on this order to refund.");
  }

  const refundable = payment.amountPaise - payment.refundedAmountPaise;
  const amountPaise = input.amountPaise ?? refundable;

  if (amountPaise <= 0 || amountPaise > refundable) {
    throw ApiError.badRequest(
      `Refundable amount is ${refundable} paise; ${amountPaise} was requested.`,
    );
  }

  const merchantRefundId = `RF-${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  const refund = await phonepe.initiateRefund({
    merchantRefundId,
    originalMerchantOrderId: payment.merchantTransactionId,
    amountPaise,
  });

  await payments.recordRefund(payment._id, {
    refundId: refund.refundId,
    amountPaise,
    status: refund.state,
    reason: input.reason,
  });

  // Only a full refund moves the order; a partial one leaves it where it is,
  // because REFUNDED is terminal and a part-refunded order still ships.
  if (amountPaise === refundable) {
    await orders.transition(order._id, "REFUNDED", ["CANCELLED", "PAYMENT_SUCCESS", "RETURN_PICKED"], {
      note: input.reason ?? "Refund issued",
      actorId: input.actorId,
      actorRole: "finance",
    });
  }

  return { merchantRefundId, amountPaise, state: refund.state };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Transaction id, ≤63 characters and alphanumeric plus `-` and `_`, which is
 * what PhonePe accepts. Built from the order number so a dashboard entry can be
 * traced back without a database lookup, with a random tail so retries of the
 * same order never collide.
 */
function buildTransactionId(orderNumber: string): string {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  return `${orderNumber}-${suffix}`.slice(0, 63);
}

/**
 * Consumes the coupon, now that the order is actually paid for.
 *
 * Counting a redemption at checkout would let anyone burn down a limited coupon
 * by starting orders they never pay for.
 */
async function redeemCoupon(order: OrderDocument) {
  if (!order.coupon?.code) return;

  const coupon = await CouponModel.findOneAndUpdate(
    { code: order.coupon.code },
    { $inc: { usedCount: 1 } },
    { returnDocument: "after" },
  ).lean();

  if (!coupon) return;

  await CouponRedemptionModel.create({
    couponId: coupon._id,
    userId: order.userId,
    orderId: order._id,
    discountPaise: order.coupon.discountPaise,
  }).catch((error) => {
    // The unique index on (couponId, orderId) makes a repeat delivery a
    // duplicate-key error, which is the correct outcome and not worth raising.
    if ((error as { code?: number }).code !== 11000) throw error;
  });
}

function view(payment: PaymentDocument, order: OrderDocument | null): PaymentView {
  return {
    merchantTransactionId: payment.merchantTransactionId,
    orderNumber: order?.orderNumber ?? "",
    status: payment.status,
    orderStatus: order?.status ?? "PENDING",
    amountPaise: payment.amountPaise,
    failureMessage: payment.failureMessage,
  };
}
