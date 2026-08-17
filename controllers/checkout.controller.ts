import type { NextRequest } from "next/server";
import { ok, created, paginationMeta } from "@/lib/api/response";
import { parseBody, parseQuery, parseParams } from "@/lib/api/validate";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { requireAuth, requireStaff } from "@/lib/auth/session";
import {
  createOrderSchema,
  listOrdersSchema,
  orderNumberParam,
  cancelOrderSchema,
  initiatePaymentSchema,
  merchantTransactionParam,
  refundSchema,
  serviceabilitySchema,
  assignCourierSchema,
} from "@/validators/checkout";
import * as orderService from "@/services/order.service";
import * as paymentService from "@/services/payment.service";
import * as shippingService from "@/services/shipping.service";

/**
 * HTTP shaping for checkout, payment and shipping.
 *
 * Same contract as the other controllers: authenticate, validate, delegate,
 * shape. No business rule lives here.
 *
 * Two things in this file are unlike the rest of the API and are worth naming:
 *
 *  - **The webhook handlers do not call `requireAuth`.** They authenticate with
 *    the gateway's own scheme, inside the service, and they are the only
 *    unauthenticated mutations in the codebase.
 *  - **They read the raw body**, not `parseBody`. A signature is computed over
 *    bytes; re-serialising parsed JSON changes key order and whitespace and
 *    invalidates it.
 */

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function createOrder(request: NextRequest) {
  const principal = await requireAuth(request);

  // Keyed by user, not IP: household and office NAT means many legitimate
  // customers share one address, and stock reservation is per account anyway.
  await enforceRateLimit("checkout", principal.userId);

  const input = await parseBody(request, createOrderSchema);

  const order = await orderService.createOrder(input, {
    userId: principal.userId,
    email: principal.email,
  });

  return created(order);
}

export async function listOrders(request: NextRequest) {
  const principal = await requireAuth(request);
  const query = parseQuery(request, listOrdersSchema);

  const result = await orderService.listOrdersForUser(principal.userId, query);

  return ok(result.items, {
    meta: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
  });
}

export async function getOrder(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { orderNumber } = parseParams(params, orderNumberParam);

  return ok(await orderService.getOrderForUser(orderNumber, principal.userId));
}

export async function cancelOrder(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { orderNumber } = parseParams(params, orderNumberParam);
  const { reason } = await parseBody(request, cancelOrderSchema);

  return ok(await orderService.cancelOrder(orderNumber, principal.userId, reason));
}

/**
 * Staff: cancel an order, including one already handed to Shiprocket.
 *
 * Cancels the live consignment first — if Shiprocket refuses because it has
 * already been picked up, the order is left as-is rather than marked
 * cancelled while a parcel is still moving.
 */
export async function cancelOrderByStaff(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "shipment:write");
  const { orderNumber } = parseParams(params, orderNumberParam);
  const { reason } = await parseBody(request, cancelOrderSchema);

  return ok(await orderService.cancelOrderByStaff(orderNumber, principal.userId, reason));
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function initiatePayment(request: NextRequest) {
  const principal = await requireAuth(request);
  await enforceRateLimit("checkout", principal.userId);

  const { orderNumber } = await parseBody(request, initiatePaymentSchema);

  return ok(await paymentService.initiatePayment(orderNumber, { userId: principal.userId }));
}

export async function paymentStatus(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  await enforceRateLimit("paymentStatus", principal.userId);

  const { merchantTransactionId } = parseParams(params, merchantTransactionParam);

  return ok(
    await paymentService.checkStatus(merchantTransactionId, { userId: principal.userId }),
  );
}

/**
 * PhonePe's server-to-server callback.
 *
 * Always answers 200 once the signature has been verified, even for events it
 * ignores. A 4xx or 5xx makes PhonePe redeliver on a backoff, and redelivering
 * a message that was correctly ignored achieves nothing but load. The two
 * exceptions — a bad signature and an unparseable body — are thrown from the
 * service and become 401 and 400.
 */
export async function phonePeWebhook(request: NextRequest) {
  const rawBody = await request.text();

  const result = await paymentService.handleWebhook({
    authorizationHeader: request.headers.get("authorization"),
    rawBody,
  });

  return ok(result);
}

export async function refund(request: NextRequest) {
  const principal = await requireStaff(request, "payment:refund");
  const input = await parseBody(request, refundSchema);

  return ok(
    await paymentService.refundOrder({
      orderNumber: input.orderNumber,
      amountPaise: input.amountPaise,
      reason: input.reason,
      actorId: principal.userId,
    }),
  );
}

/**
 * Manual trigger for the reconciliation sweep.
 *
 * Exposed so it can be driven by an external scheduler — Vercel Cron, a systemd
 * timer, GitHub Actions — since a serverless deployment has no long-lived
 * process to host an interval. Staff-only; it is an expensive endpoint.
 */
export async function reconcile(request: NextRequest) {
  await requireStaff(request, "payment:read");

  return ok(await paymentService.reconcileStalePayments());
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

/**
 * Public: the storefront checks a pincode before the customer commits.
 *
 * Rate-limited by IP because it is unauthenticated and each call can reach
 * Shiprocket — otherwise it is a free proxy to someone else's API quota.
 */
export async function serviceability(request: NextRequest) {
  await enforceRateLimit("publicRead", clientIp(request));

  const query = parseQuery(request, serviceabilitySchema);

  return ok(
    await shippingService.checkServiceability({
      pincode: query.pincode,
      cartValuePaise: query.cartValuePaise,
    }),
  );
}

export async function tracking(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { orderNumber } = parseParams(params, orderNumberParam);

  return ok(await shippingService.getTracking(orderNumber, principal.userId));
}

export async function shiprocketWebhook(request: NextRequest) {
  // Tolerant of a malformed body: an empty object flows through to the service,
  // which answers "no AWB in payload" with a 200 rather than making Shiprocket
  // retry a message that will never parse.
  const body = await request
    .json()
    .catch(() => ({}))
    .then((value) => value as Parameters<typeof shippingService.handleTrackingWebhook>[0]["body"]);

  const result = await shippingService.handleTrackingWebhook({
    apiKeyHeader: request.headers.get("x-api-key"),
    body,
  });

  return ok(result);
}

/** Staff: file the consignment when the automatic attempt failed. */
export async function createShipment(request: NextRequest, params: unknown) {
  await requireStaff(request, "shipment:write");
  const { orderNumber } = parseParams(params, orderNumberParam);

  const order = await orderService.getOrderByNumberForStaff(orderNumber);

  return created(await shippingService.createShipmentForOrder(String(order._id)));
}

/** Staff: assign a courier and book the pickup. */
export async function assignCourier(request: NextRequest) {
  await requireStaff(request, "shipment:write");
  const input = await parseBody(request, assignCourierSchema);

  const order = await orderService.getOrderByNumberForStaff(input.orderNumber);

  return ok(await shippingService.assignCourier(String(order._id), input.courierId));
}

/** Staff: fetch the commercial invoice PDF url for a shipped order. */
export async function getShipmentInvoice(request: NextRequest, params: unknown) {
  await requireStaff(request, "shipment:read");
  const { orderNumber } = parseParams(params, orderNumberParam);

  const order = await orderService.getOrderByNumberForStaff(orderNumber);

  return ok({ invoiceUrl: await shippingService.getInvoiceUrl(String(order._id)) });
}
