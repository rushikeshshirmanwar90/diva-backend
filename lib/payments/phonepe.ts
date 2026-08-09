import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { phonePeConfig, isProduction } from "@/config/env";
import type { PaymentStatus } from "@/models/enums";

/**
 * PhonePe Standard Checkout v2.
 *
 * This is the OAuth product, **not** the legacy `X-VERIFY` checksum flow that
 * the previous storefront used. The two are not variants of one API; they have
 * different hosts, different auth, and different response shapes. If a request
 * here 401s with a message about a checksum, the merchant account is still on
 * v1 and this file is the wrong driver.
 *
 * Everything PhonePe-specific lives in this module. Services above it deal in
 * `initiatePayment` / `fetchOrderStatus` and never see a bearer token, a host
 * name, or a `state` string. That boundary is what makes a future migration —
 * or a swap to a different gateway — a change to one file.
 *
 * ## Amounts
 *
 * PhonePe's `amount` is in paise, which happens to match this codebase's
 * internal unit exactly. No conversion happens anywhere in this file, and none
 * should be added: the reference implementation's `amount: 100 * amount` was
 * only needed because it held rupees.
 *
 * ## Verifying this against the dashboard
 *
 * Hosts and field names below are the published v2 contract. They are gathered
 * into `ENDPOINTS` and the request builders rather than scattered, so they can
 * be diffed against the developer docs in one pass.
 */

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

/**
 * Note the asymmetry: in production the OAuth service lives under
 * `identity-manager` while the payment API lives under `pg`, whereas sandbox
 * serves both from `pg-sandbox`. Deriving one from the other is the mistake
 * this table exists to prevent.
 */
const ENDPOINTS = {
  SANDBOX: {
    oauth: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
    pg: "https://api-preprod.phonepe.com/apis/pg-sandbox",
  },
  PRODUCTION: {
    oauth: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
    pg: "https://api.phonepe.com/apis/pg",
  },
} as const;

/** Fails fast, and names the missing configuration. */
function config() {
  const resolved = phonePeConfig();

  if (!resolved) {
    throw ApiError.serviceUnavailable(
      "Online payment is not available right now. Please try again shortly.",
    );
  }

  return resolved;
}

function hosts() {
  return ENDPOINTS[config().environment];
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

type CachedToken = { accessToken: string; expiresAtMs: number };

/**
 * Module-level token cache.
 *
 * Tokens are valid for hours, and PhonePe rate-limits the token endpoint. A
 * fetch-per-payment would spend one round trip and one slice of that budget on
 * every checkout for no benefit.
 *
 * The cache is per-process, so a horizontally-scaled deployment holds one token
 * per instance. That is fine — tokens are not single-use and issuing several
 * concurrently is supported. Moving this to Redis would buy nothing.
 */
let cachedToken: CachedToken | null = null;

/**
 * Refresh this long before the stated expiry.
 *
 * A token that expires mid-flight fails a customer's payment initiation, and
 * PhonePe's `expires_at` is server-side time — clock skew between their host
 * and ours is real. Sixty seconds absorbs both.
 */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export function invalidateTokenCache(): void {
  cachedToken = null;
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now()) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret, clientVersion } = config();

  // Form-encoded, not JSON. The token endpoint is the one call in the v2 API
  // that is not JSON, and sending JSON here returns a confusing 400.
  const body = new URLSearchParams({
    client_id: clientId,
    client_version: String(clientVersion),
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch(hosts().oauth, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    // Never cached by Next's extended fetch: a stale token is an outage.
    cache: "no-store",
  });

  const payload = (await safeJson(response)) as {
    access_token?: string;
    expires_at?: number;
    token_type?: string;
    message?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw ApiError.serviceUnavailable(
      "Could not reach the payment gateway. Please try again in a moment.",
      new Error(
        `PhonePe OAuth failed (${response.status}): ${payload.message ?? "no access_token in response"}`,
      ),
    );
  }

  // `expires_at` is epoch **seconds**, not milliseconds. Treating it as ms puts
  // expiry in the year 57000 and the cache never refreshes — which works
  // perfectly until the token actually expires, then fails every payment.
  const expiresAtMs = payload.expires_at
    ? payload.expires_at * 1000 - TOKEN_REFRESH_MARGIN_MS
    : Date.now() + 15 * 60_000;

  cachedToken = { accessToken: payload.access_token, expiresAtMs };

  return payload.access_token;
}

/**
 * Authenticated call, with exactly one retry on 401.
 *
 * A 401 from the PG almost always means the cached token was revoked early —
 * credentials rotated in the dashboard, or the instance slept through the
 * expiry. Dropping the cache and retrying once turns that into a slow request
 * instead of a failed payment. It retries once and never loops, because a
 * genuine credential problem must surface rather than hammer the gateway.
 */
async function authedFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  retry = true,
): Promise<unknown> {
  const token = await accessToken();

  const response = await fetch(`${hosts().pg}${path}`, {
    method: init.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      // "O-Bearer", not "Bearer". PhonePe rejects the standard prefix.
      Authorization: `O-Bearer ${token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  if (response.status === 401 && retry) {
    invalidateTokenCache();
    return authedFetch(path, init, false);
  }

  const payload = await safeJson(response);

  if (!response.ok) {
    const detail = payload as { message?: string; code?: string };

    throw ApiError.serviceUnavailable(
      "The payment gateway rejected this request. Please try again.",
      new Error(
        `PhonePe ${init.method} ${path} → ${response.status} ` +
          `${detail.code ?? ""} ${detail.message ?? JSON.stringify(payload)}`,
      ),
    );
  }

  return payload;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    // PhonePe returns HTML on some gateway-level errors (WAF blocks, 502s).
    // Surfacing the first 300 characters makes those diagnosable.
    return { message: text.slice(0, 300) };
  }
}

// ---------------------------------------------------------------------------
// Payment initiation
// ---------------------------------------------------------------------------

export type InitiateInput = {
  /** Our `merchantTransactionId`. Must be unique per attempt, ≤63 chars. */
  merchantOrderId: string;
  amountPaise: number;
  /** Where PhonePe sends the browser after the customer finishes or gives up. */
  redirectUrl: string;
  /** Shown on the PhonePe payment page. */
  message?: string;
  /** Seconds before the payment link dies. PhonePe caps this at 3600. */
  expireAfterSeconds?: number;
  /**
   * Free-form fields echoed back on the status response and the webhook.
   *
   * Useful for correlation in the dashboard, but **never trusted as input** —
   * they round-trip through a system we do not control. The order id is
   * resolved from `merchantOrderId` against our own database instead.
   */
  metaInfo?: Partial<Record<"udf1" | "udf2" | "udf3" | "udf4" | "udf5", string>>;
};

export type InitiateResult = {
  /** PhonePe's own order reference, e.g. `OMO2506...`. */
  gatewayOrderId: string;
  /** Send the customer here. */
  redirectUrl: string;
  state: string;
  expireAtMs?: number;
};

export async function initiatePayment(input: InitiateInput): Promise<InitiateResult> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
    // PhonePe's floor is ₹1. Catching it here produces a clear error instead of
    // a gateway rejection the customer sees as "payment failed".
    throw ApiError.badRequest("The payable amount is too small to process.");
  }

  const payload = await authedFetch("/checkout/v2/pay", {
    method: "POST",
    body: {
      merchantOrderId: input.merchantOrderId,
      amount: input.amountPaise,
      expireAfter: input.expireAfterSeconds ?? 1200,
      ...(input.metaInfo ? { metaInfo: input.metaInfo } : {}),
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: input.message ?? "Diva jewellery order",
        merchantUrls: { redirectUrl: input.redirectUrl },
      },
    },
  });

  const result = payload as {
    orderId?: string;
    state?: string;
    redirectUrl?: string;
    expireAt?: number;
  };

  if (!result.redirectUrl) {
    throw ApiError.serviceUnavailable(
      "The payment gateway did not return a payment page. Please try again.",
      new Error(`PhonePe pay response missing redirectUrl: ${JSON.stringify(payload)}`),
    );
  }

  return {
    gatewayOrderId: result.orderId ?? "",
    redirectUrl: result.redirectUrl,
    state: result.state ?? "PENDING",
    expireAtMs: result.expireAt,
  };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type GatewayStatus = {
  gatewayOrderId?: string;
  /** `COMPLETED` | `FAILED` | `PENDING`, mapped below. */
  state: string;
  status: PaymentStatus;
  /** What the gateway says was actually paid, in paise. */
  amountPaise?: number;
  /** `UPI_INTENT`, `CARD`, `NET_BANKING`, … */
  instrument?: string;
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** The untouched body, for the Payment document's `rawCallbacks`. */
  raw: unknown;
};

/**
 * Asks PhonePe what happened to a payment.
 *
 * This is the authority, not the browser redirect. A customer who closes the
 * tab after paying, or whose network drops on the way back, never hits the
 * return URL — and a customer who edits the return URL can claim anything.
 * Order fulfilment is driven from this call and from the webhook, both of which
 * come from PhonePe directly.
 */
export async function fetchOrderStatus(merchantOrderId: string): Promise<GatewayStatus> {
  const payload = await authedFetch(
    `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=true`,
    { method: "GET" },
  );

  return parseStatusPayload(payload);
}

/** Shared by the status call and the webhook, which carry the same shape. */
export function parseStatusPayload(payload: unknown): GatewayStatus {
  const body = payload as {
    orderId?: string;
    state?: string;
    amount?: number;
    paymentDetails?: Array<{
      paymentMode?: string;
      transactionId?: string;
      state?: string;
      amount?: number;
      errorCode?: string;
      detailedErrorCode?: string;
    }>;
  };

  // `paymentDetails` is an attempt log, oldest first. The last entry is the
  // attempt that decided the order — earlier ones are the customer's failed
  // tries and must not be read as the outcome.
  const attempt = body.paymentDetails?.[body.paymentDetails.length - 1];
  const state = body.state ?? attempt?.state ?? "PENDING";

  return {
    gatewayOrderId: body.orderId,
    state,
    status: mapState(state),
    amountPaise: body.amount ?? attempt?.amount,
    instrument: attempt?.paymentMode,
    transactionId: attempt?.transactionId,
    errorCode: attempt?.errorCode ?? attempt?.detailedErrorCode,
    errorMessage: attempt?.errorCode ? describeError(attempt.errorCode) : undefined,
    raw: payload,
  };
}

/**
 * Gateway state → our `PaymentStatus`.
 *
 * Unknown states map to `PENDING`, never to `FAILED`. If PhonePe introduces a
 * state we do not recognise, treating it as pending leaves the reconciliation
 * job to resolve it; treating it as failed would release stock and email a
 * failure notice for a payment that may have succeeded.
 */
export function mapState(state: string): PaymentStatus {
  switch (state.toUpperCase()) {
    case "COMPLETED":
    case "SUCCESS":
      return "SUCCESS";
    case "FAILED":
    case "ERROR":
      return "FAILED";
    default:
      return "PENDING";
  }
}

/** Customer-safe wording for the error codes worth distinguishing. */
function describeError(code: string): string {
  switch (code) {
    case "AUTHORIZATION_FAILED":
      return "Your bank did not authorise the payment.";
    case "INSUFFICIENT_FUNDS":
      return "The payment was declined for insufficient funds.";
    case "TRANSACTION_NOT_FOUND":
      return "The gateway has no record of this payment attempt.";
    case "TIMED_OUT":
    case "PAYMENT_ERROR":
      return "The payment timed out before it completed.";
    default:
      return "The payment did not go through.";
  }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundResult = {
  refundId: string;
  state: string;
  amountPaise: number;
  raw: unknown;
};

export async function initiateRefund(input: {
  /** Our reference for this refund. Unique; reused calls are idempotent. */
  merchantRefundId: string;
  /** The `merchantOrderId` of the payment being refunded. */
  originalMerchantOrderId: string;
  amountPaise: number;
}): Promise<RefundResult> {
  const payload = await authedFetch("/payments/v2/refund", {
    method: "POST",
    body: {
      merchantRefundId: input.merchantRefundId,
      originalMerchantOrderId: input.originalMerchantOrderId,
      amount: input.amountPaise,
    },
  });

  const body = payload as { refundId?: string; state?: string; amount?: number };

  return {
    refundId: body.refundId ?? input.merchantRefundId,
    state: body.state ?? "PENDING",
    amountPaise: body.amount ?? input.amountPaise,
    raw: payload,
  };
}

export async function fetchRefundStatus(merchantRefundId: string): Promise<unknown> {
  return authedFetch(`/payments/v2/refund/${encodeURIComponent(merchantRefundId)}/status`, {
    method: "GET",
  });
}

// ---------------------------------------------------------------------------
// Webhook authentication
// ---------------------------------------------------------------------------

/**
 * Verifies a webhook's `Authorization` header.
 *
 * PhonePe does not sign the body. It sends `SHA256(username:password)` using
 * the credentials you set on the dashboard's webhook screen — so this proves
 * the caller knows a shared secret, and nothing about the payload's integrity.
 *
 * That distinction drives the rest of the design: a verified webhook is treated
 * as a *notification that something changed*, and the amount and state that
 * decide fulfilment are re-read from `fetchOrderStatus`. A body that is merely
 * authenticated is not the same as a body that is authoritative.
 *
 * The comparison is constant-time. A fast `!==` leaks, through timing, how many
 * leading characters of a guess were right, which turns an infeasible search
 * into a feasible one.
 */
export function verifyWebhookAuth(authorizationHeader: string | null): boolean {
  const { webhookUsername, webhookPassword } = config();

  if (!webhookUsername || !webhookPassword) {
    // Refusing is deliberate. Accepting unverified callbacks because the
    // secret is unset would mean anyone who learns the URL can mark orders paid.
    if (!isProduction) {
      console.warn(
        "[phonepe] Webhook rejected: PHONEPE_WEBHOOK_USERNAME/PASSWORD are not set.",
      );
    }
    return false;
  }

  if (!authorizationHeader) return false;

  const expected = createHash("sha256")
    .update(`${webhookUsername}:${webhookPassword}`)
    .digest("hex");

  // PhonePe has been observed sending the digest bare and, in some dashboards,
  // prefixed with "SHA256 ". Accept both rather than fail a valid delivery.
  const received = authorizationHeader.replace(/^SHA256\s+/i, "").trim().toLowerCase();

  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on length mismatch, which is itself a leak-free
  // signal — different lengths cannot be equal.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Events this integration acts on. Anything else is logged and ignored. */
export const HANDLED_EVENTS = new Set([
  "checkout.order.completed",
  "checkout.order.failed",
  "pg.refund.completed",
  "pg.refund.failed",
]);
