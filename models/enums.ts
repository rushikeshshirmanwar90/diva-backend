/**
 * Shared enumerations.
 *
 * Every one of these is part of the API contract — clients switch on these
 * exact strings. Adding a member is backwards-compatible; renaming or removing
 * one is a breaking change and belongs in CHANGELOG-API.md.
 *
 * They live in one file rather than beside their models because several are
 * used across collection boundaries (an order line snapshots a `Gender`, a
 * shipment reads an `OrderStatus`), and duplicating them is how two files end
 * up disagreeing about whether the value is `OUT_FOR_DELIVERY` or
 * `OUT_FOR_DELIVERY_`.
 */

// --- Access control ---------------------------------------------------------

export const ROLES = [
  "customer",
  /** Reads orders, replies to tickets. No catalogue or money access. */
  "support",
  /** Products, categories, collections, banners, blogs. */
  "catalog",
  /** Payments, refunds, reports. */
  "finance",
  /** Everything except assigning roles. */
  "admin",
  /** Everything, including role assignment. */
  "superadmin",
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that may reach the admin UI at all. */
export const STAFF_ROLES: Role[] = ["support", "catalog", "finance", "admin", "superadmin"];

// --- Catalogue --------------------------------------------------------------

/**
 * Variant colour is deliberately **not** an enum — an admin may type any finish
 * the store starts stocking. It lives in `lib/colour.ts`, which also holds the
 * normaliser that keeps free-typed values from fragmenting the storefront
 * facet.
 */

export const GENDERS = ["WOMEN", "MEN", "UNISEX", "KIDS"] as const;
export type Gender = (typeof GENDERS)[number];

export const OCCASIONS = [
  "DAILY_WEAR",
  "WEDDING",
  "ENGAGEMENT",
  "FESTIVAL",
  "PARTY",
  "OFFICE",
  "GIFT",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

// --- Orders -----------------------------------------------------------------

export const ORDER_STATUSES = [
  "PENDING",
  "PAYMENT_INITIATED",
  "PAYMENT_FAILED",
  "ABANDONED",
  "PAYMENT_SUCCESS",
  "CONFIRMED",
  "SHIPMENT_CREATED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURN_PICKED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "INITIATED",
  "PENDING",
  "SUCCESS",
  "FAILED",
  "REFUND_INITIATED",
  "REFUNDED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["PHONEPE", "COD", "MANUAL"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// --- Misc -------------------------------------------------------------------

export const ADDRESS_TYPES = ["HOME", "WORK", "OTHER"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

export const COUPON_TYPES = ["PERCENT", "FLAT"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const MODERATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "ORDER_PLACED",
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
  "REFUND_PROCESSED",
  "PRICE_DROP",
  "BACK_IN_STOCK",
  "PROMOTION",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
