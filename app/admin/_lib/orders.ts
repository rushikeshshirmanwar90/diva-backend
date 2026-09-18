import type { OrderStatus, PaymentMethod } from "@/app/admin/_lib/api";
import type { StatusTone } from "@/app/admin/_components/ui";

/**
 * How each order status reads and colours in the console.
 *
 * One table, used by the dashboard, the orders list and the order page, so
 * "CONFIRMED" is "To ship" everywhere and never "Confirmed" on one screen and
 * "Paid" on another.
 */
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: "Awaiting payment", tone: "processing" },
  PAYMENT_INITIATED: { label: "Paying", tone: "processing" },
  PAYMENT_FAILED: { label: "Payment failed", tone: "low" },
  ABANDONED: { label: "Abandoned", tone: "low" },
  PAYMENT_SUCCESS: { label: "Paid", tone: "paid" },
  CONFIRMED: { label: "To ship", tone: "paid" },
  SHIPMENT_CREATED: { label: "Label created", tone: "shipped" },
  SHIPPED: { label: "Shipped", tone: "shipped" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "shipped" },
  DELIVERED: { label: "Delivered", tone: "delivered" },
  CANCELLED: { label: "Cancelled", tone: "low" },
  RETURN_REQUESTED: { label: "Return requested", tone: "low" },
  RETURN_PICKED: { label: "Return picked", tone: "low" },
  REFUNDED: { label: "Refunded", tone: "processing" },
};

export function orderStatusMeta(status: OrderStatus): { label: string; tone: StatusTone } {
  return ORDER_STATUS_META[status] ?? { label: status, tone: "processing" };
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PHONEPE: "PhonePe",
  COD: "Cash on delivery",
  MANUAL: "Manual",
};

/** The filter chips on the orders list, in the order a fulfilment desk works them. */
export const ORDER_FILTERS: { key: OrderStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "CONFIRMED", label: "To ship" },
  { key: "SHIPMENT_CREATED", label: "Label created" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "PENDING", label: "Awaiting payment" },
  { key: "PAYMENT_FAILED", label: "Payment failed" },
  { key: "RETURN_REQUESTED", label: "Returns" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "REFUNDED", label: "Refunded" },
];
