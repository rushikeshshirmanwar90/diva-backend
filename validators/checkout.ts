import { z } from "zod";
import { objectId, paise, pagination, phone, pincode } from "@/validators/common";
import { ORDER_STATUSES } from "@/models/enums";

/**
 * Checkout, payment and shipping input schemas.
 *
 * Note what is **absent** from `createOrderSchema`: there is no price, no
 * total, no GST and no shipping charge. The client says what it wants and how
 * many; every rupee is computed server-side in `order.service`. A price field
 * here — even one the service currently ignores — is a field some future
 * refactor starts trusting.
 *
 * Every schema is `.strict()`, so an unexpected key is a 400 rather than a
 * silently dropped one.
 */

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** The subset of `PAYMENT_METHODS` a customer may pick for themselves. */
export const CHECKOUT_PAYMENT_METHODS = ["PHONEPE", "COD"] as const;
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

export const addressInput = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    phone,
    alternatePhone: phone.optional(),
    line1: z.string().trim().min(4).max(200),
    line2: z.string().trim().max(200).optional(),
    landmark: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    pincode,
    country: z.string().trim().max(60).default("India"),
  })
  .strict();

export const orderItemInput = z
  .object({
    productId: objectId,
    variantId: objectId,
    /**
     * Capped at 5. Jewellery is not bought by the dozen, and an uncapped
     * quantity is a way to reserve a whole line of stock with one request.
     */
    quantity: z.number().int().min(1).max(5),
  })
  .strict();

export const createOrderSchema = z
  .object({
    items: z.array(orderItemInput).min(1).max(20),

    /**
     * Either a saved address id or a full inline address. Both are accepted
     * because a guest-to-account flow has the address before it has a row for
     * it; the service rejects a request carrying neither.
     */
    addressId: objectId.optional(),
    shippingAddress: addressInput.optional(),
    billingAddress: addressInput.optional(),

    couponCode: z.string().trim().toUpperCase().max(30).optional(),
    giftNote: z.string().trim().max(200).optional(),

    /**
     * How the customer intends to pay. `MANUAL` is deliberately not offered —
     * it exists for staff-recorded payments, not self-service checkout. COD
     * eligibility (store switch, order-value cap) is enforced in the service.
     */
    paymentMethod: z.enum(CHECKOUT_PAYMENT_METHODS).default("PHONEPE"),
  })
  .strict()
  .refine((value) => Boolean(value.addressId ?? value.shippingAddress), {
    message: "Provide either addressId or shippingAddress",
    path: ["addressId"],
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const listOrdersSchema = pagination.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});

/** Staff listing: the customer filter plus a prefix search on order number or email. */
export const listOrdersAdminSchema = listOrdersSchema.extend({
  search: z.string().trim().max(120).optional(),
});

/**
 * Statuses staff may set by hand.
 *
 * Only the fulfilment leg. Payment states are owned by the gateway and its
 * webhooks; cancellation and shipment creation have their own endpoints
 * with their own side effects. What is left is the courier's journey, for a
 * store that ships some parcels outside Shiprocket — or whose webhook has not
 * arrived — and needs the customer's tracker to move anyway.
 */
export const MANUAL_ORDER_STATUSES = [
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURN_REQUESTED",
  "RETURN_PICKED",
] as const;

export const setOrderStatusSchema = z
  .object({
    status: z.enum(MANUAL_ORDER_STATUSES),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const orderNumberParam = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^DIVA-\d{8}-\d{4}$/, "Not a valid order number"),
});

export const cancelOrderSchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .strict();

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const initiatePaymentSchema = z
  .object({ orderNumber: orderNumberParam.shape.orderNumber })
  .strict();

/**
 * The transaction reference, as it appears in a return URL.
 *
 * Constrained to the character set PhonePe issues and this codebase generates.
 * It is interpolated into a gateway URL path, so an unvalidated value here is a
 * request-smuggling surface as well as a database lookup with attacker-chosen
 * content.
 */
export const merchantTransactionParam = z.object({
  merchantTransactionId: z
    .string()
    .trim()
    .min(8)
    .max(63)
    .regex(/^[A-Za-z0-9_-]+$/, "Not a valid payment reference"),
});

export const refundSchema = z
  .object({
    orderNumber: orderNumberParam.shape.orderNumber,
    /** Omitted means refund everything still refundable. */
    amountPaise: paise.optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export const serviceabilitySchema = z.object({
  pincode,
  /**
   * Used for the free-shipping threshold and the courier's declared value.
   * Coerced because it arrives in a query string.
   */
  cartValuePaise: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
});

export const assignCourierSchema = z
  .object({
    orderNumber: orderNumberParam.shape.orderNumber,
    /** Omitted lets Shiprocket's own courier rules decide. */
    courierId: z.number().int().positive().optional(),
  })
  .strict();
