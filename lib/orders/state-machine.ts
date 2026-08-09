import { ApiError } from "@/lib/api/errors";
import type { OrderStatus } from "@/models/enums";

/**
 * The order state machine.
 *
 * Every status change in the system goes through `assertTransition`. Nothing
 * anywhere calls `findByIdAndUpdate({ status })` directly.
 *
 * The reason is that illegal transitions are not hypothetical. A late PhonePe
 * webhook arriving after a customer cancelled would otherwise flip a CANCELLED
 * order back to PAYMENT_SUCCESS and ship goods for a refunded payment. A
 * duplicate Shiprocket callback would move DELIVERED back to SHIPPED. Encoding
 * the legal edges in one place makes those into logged, rejected no-ops instead
 * of silent data corruption.
 *
 *                     ┌──────────────────────────────────┐
 *                     ▼                                  │
 *   PENDING ──▶ PAYMENT_INITIATED ──▶ PAYMENT_FAILED ────┘ (retry)
 *                     │                     │
 *                     │                     └──────▶ ABANDONED (TTL sweep)
 *                     ▼
 *               PAYMENT_SUCCESS ──▶ CONFIRMED ──▶ SHIPMENT_CREATED
 *                                       │                │
 *                                       │                ▼
 *                                       │            SHIPPED ──▶ OUT_FOR_DELIVERY ──▶ DELIVERED
 *                                       ▼                                                 │
 *                                   CANCELLED ◀── (pre-ship only)              RETURN_REQUESTED
 *                                       │                                                 │
 *                                       ▼                                                 ▼
 *                                   REFUNDED ◀───────────────────────────────────── RETURN_PICKED
 */

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["PAYMENT_INITIATED", "CANCELLED", "ABANDONED"],

  /** Retry is a loop back to itself: a customer may attempt payment repeatedly. */
  PAYMENT_INITIATED: ["PAYMENT_SUCCESS", "PAYMENT_FAILED", "PAYMENT_INITIATED", "ABANDONED"],

  PAYMENT_FAILED: ["PAYMENT_INITIATED", "ABANDONED", "CANCELLED"],

  /** Terminal. A swept checkout is not resurrected; the customer starts over. */
  ABANDONED: [],

  PAYMENT_SUCCESS: ["CONFIRMED", "CANCELLED", "REFUNDED"],

  CONFIRMED: ["SHIPMENT_CREATED", "CANCELLED"],

  /**
   * Cancellation is still permitted here — the label exists but the courier has
   * not collected. After SHIPPED it is a return, not a cancellation.
   */
  SHIPMENT_CREATED: ["SHIPPED", "CANCELLED"],

  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED", "RETURN_REQUESTED"],

  OUT_FOR_DELIVERY: ["DELIVERED", "RETURN_REQUESTED"],

  DELIVERED: ["RETURN_REQUESTED"],

  CANCELLED: ["REFUNDED"],

  RETURN_REQUESTED: ["RETURN_PICKED", "DELIVERED"],

  RETURN_PICKED: ["REFUNDED"],

  /** Terminal, and deliberately so. Money has moved back. */
  REFUNDED: [],
};

/** Statuses after which the customer can no longer self-cancel. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = [
  "PENDING",
  "PAYMENT_FAILED",
  "PAYMENT_SUCCESS",
  "CONFIRMED",
];

/** Statuses that mean money has been captured and is owed back on cancellation. */
export const PAID_STATUSES: readonly OrderStatus[] = [
  "PAYMENT_SUCCESS",
  "CONFIRMED",
  "SHIPMENT_CREATED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURN_REQUESTED",
  "RETURN_PICKED",
];

/** Statuses where stock should be held against this order. */
export const STOCK_HELD_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "PAYMENT_INITIATED",
  "PAYMENT_SUCCESS",
  "CONFIRMED",
  "SHIPMENT_CREATED",
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/**
 * Throws unless the transition is legal.
 *
 * A 409 rather than a 400: the request was well-formed, it just conflicts with
 * the order's current state. Clients distinguish these — a 400 means "fix your
 * payload", a 409 means "reload and look again".
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) {
    throw ApiError.conflict(`Order is already ${from}`);
  }

  if (!canTransition(from, to)) {
    const allowed = TRANSITIONS[from];
    throw ApiError.conflict(
      allowed.length
        ? `Cannot move an order from ${from} to ${to}. Allowed: ${allowed.join(", ")}.`
        : `${from} is a final status and cannot be changed.`,
    );
  }
}

/**
 * Idempotent variant for webhook handlers.
 *
 * Payment and courier webhooks are delivered more than once by design. A repeat
 * delivery of "payment succeeded" for an already-successful order is normal
 * traffic, not an error, and must not produce a 409 — that would make the
 * gateway retry indefinitely against a perfectly healthy system.
 */
export function shouldApplyTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return canTransition(from, to);
}
