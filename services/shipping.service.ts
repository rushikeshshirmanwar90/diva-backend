import { ApiError } from "@/lib/api/errors";
import { getStoreSettings, isPincodeBlocked } from "@/lib/settings";
import { shiprocketConfig } from "@/config/env";
import * as shiprocket from "@/lib/shipping/shiprocket";
import * as orders from "@/repositories/order.repository";
import * as shipments from "@/repositories/shipment.repository";
import { shouldApplyTransition } from "@/lib/orders/state-machine";
import type { OrderStatus } from "@/models/enums";

/**
 * Shipping.
 *
 * Two entry points matter: a serviceability check the storefront runs *before*
 * payment, and shipment creation that runs *after* it. The previous
 * implementation did neither — it created the Shiprocket order from the
 * browser, before the customer had paid, using a bearer token in the client
 * bundle. Each of those is a separate way to lose money, so the ordering here
 * is deliberate.
 */

// ---------------------------------------------------------------------------
// Serviceability — pre-payment
// ---------------------------------------------------------------------------

export type ServiceabilityResult = {
  serviceable: boolean;
  pincode: string;
  /** Shipping charged to the customer, from store settings — not the courier's quote. */
  shippingChargePaise: number;
  estimatedDays: { min: number; max: number } | null;
  courierName: string | null;
  reason?: string;
};

/**
 * Can we deliver here, and by when?
 *
 * The customer is quoted the shop's own shipping charge, never the courier's
 * rate. The two are unrelated: the shop's rate is a policy (free above a
 * threshold, flat below it), while the courier's is a cost that varies by
 * parcel and route. Passing the courier quote through would make shipping
 * fluctuate between page loads.
 */
export async function checkServiceability(input: {
  pincode: string;
  cartValuePaise: number;
  weightKg?: number;
}): Promise<ServiceabilityResult> {
  const settings = await getStoreSettings();

  const shippingChargePaise =
    input.cartValuePaise >= settings.shipping.freeShippingThresholdPaise
      ? 0
      : settings.shipping.flatRatePaise;

  if (isPincodeBlocked(input.pincode, settings.shipping.blockedPincodePrefixes)) {
    return {
      serviceable: false,
      pincode: input.pincode,
      shippingChargePaise,
      estimatedDays: null,
      courierName: null,
      reason: "We are not currently delivering to this pincode.",
    };
  }

  /**
   * Shiprocket being unreachable must not block checkout.
   *
   * The store's own estimate is shown instead. Refusing to sell because a
   * third-party lookup timed out is a worse outcome than shipping a day later
   * than promised — and the pincode is checked again at fulfilment anyway.
   */
  let quote: shiprocket.Serviceability | null = null;

  if (shiprocketConfig()) {
    try {
      quote = await shiprocket.checkServiceability({
        deliveryPincode: input.pincode,
        declaredValuePaise: input.cartValuePaise,
        weightKg: input.weightKg,
        cod: false,
      });
    } catch (error) {
      console.warn("[shipping] Serviceability lookup failed; falling back to defaults", error);
    }
  }

  if (quote && !quote.serviceable) {
    return {
      serviceable: false,
      pincode: input.pincode,
      shippingChargePaise,
      estimatedDays: null,
      courierName: null,
      reason: "No courier currently delivers insured jewellery to this pincode.",
    };
  }

  const courierDays = quote?.cheapest?.estimatedDays ?? null;

  return {
    serviceable: true,
    pincode: input.pincode,
    shippingChargePaise,
    estimatedDays: courierDays
      ? { min: courierDays, max: courierDays + 1 }
      : {
          min: settings.shipping.estimatedDaysMin,
          max: settings.shipping.estimatedDaysMax,
        },
    courierName: quote?.cheapest?.courierName ?? null,
  };
}

// ---------------------------------------------------------------------------
// Shipment creation — post-payment
// ---------------------------------------------------------------------------

/**
 * Creates the Shiprocket order for a paid, confirmed order.
 *
 * Called automatically when payment settles, and re-callable by an operator
 * when that failed. Safe to call twice: an existing shipment row short-circuits
 * it, so a retry never files a duplicate consignment.
 */
export async function createShipmentForOrder(orderId: string) {
  const order = await orders.findById(orderId);
  if (!order) throw ApiError.notFound("We could not find that order.");

  const existing = await shipments.findByOrderId(order._id);
  if (existing) return existing;

  if (order.status !== "CONFIRMED") {
    throw ApiError.conflict(
      `Only a confirmed order can be shipped; this one is ${order.status}.`,
    );
  }

  const address = order.shippingAddress;

  const created = await shiprocket.createShipmentOrder({
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    address: {
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? undefined,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
      email: order.customerEmail,
    },
    items: order.items.map((item) => ({
      name: item.title,
      sku: item.sku,
      quantity: item.quantity,
      // Pre-tax unit price. Shiprocket adds `tax` on top, so passing the
      // tax-inclusive figure would declare the GST twice on the invoice.
      unitPricePaise: item.unitPricePaise,
      discountPaise: item.lineDiscountPaise,
      taxPercent: item.gstPercent,
      hsnCode: item.hsnCode ?? undefined,
    })),
    subtotalPaise: order.totals.subtotalPaise,
    shippingChargePaise: order.totals.shippingPaise,
    discountPaise: order.totals.discountPaise,
    paymentMethod: "Prepaid",
    weightKg: parcelWeightKg(order.items),
  });

  const shipment = await shipments.create({
    orderId: order._id,
    shiprocketOrderId: created.shiprocketOrderId,
    shiprocketShipmentId: created.shipmentId,
    status: "CREATED",
    weightGrams: Math.round(parcelWeightKg(order.items) * 1000),
    shippingChargePaise: order.totals.shippingPaise,
    isReturn: false,
  });

  await orders.attachShipment(order._id, shipment._id);
  await orders.transition(order._id, "SHIPMENT_CREATED", "CONFIRMED", {
    note: `Shiprocket order ${created.shiprocketOrderId}`,
  });

  return shipment;
}

/**
 * Assigns a courier and books the pickup.
 *
 * Split from creation because it is the step that most often needs a human:
 * couriers refuse routes, and the AWB call fails with the shipment already
 * filed. Keeping them separate means a retry does not re-file the consignment.
 */
export async function assignCourier(orderId: string, courierId?: number) {
  const shipment = await shipments.findByOrderId(orderId);
  if (!shipment) throw ApiError.notFound("No shipment exists for this order yet.");

  if (shipment.awbCode) return shipment;
  if (!shipment.shiprocketShipmentId) {
    throw ApiError.conflict("This shipment has no Shiprocket reference.");
  }

  const awb = await shiprocket.assignAwb(shipment.shiprocketShipmentId, courierId);

  await shiprocket.schedulePickup(shipment.shiprocketShipmentId).catch((error) => {
    // The AWB is the part that matters; a pickup can be rescheduled from the
    // Shiprocket dashboard. Failing the whole call here would strand the AWB.
    console.warn("[shipping] Pickup scheduling failed", error);
  });

  const labelUrl = await shiprocket
    .generateLabel(shipment.shiprocketShipmentId)
    .catch(() => null);

  return shipments.update(shipment._id, {
    awbCode: awb.awbCode,
    courierId: awb.courierId,
    courierName: awb.courierName,
    labelUrl: labelUrl ?? undefined,
    status: "AWB_ASSIGNED",
    pickupScheduledAt: new Date(),
    trackingUrl: `https://shiprocket.co/tracking/${awb.awbCode}`,
  });
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/** What the customer sees on their order page. */
export async function getTracking(orderNumber: string, userId: string) {
  const order = await orders.findOwnedByNumber(orderNumber, userId);
  if (!order) throw ApiError.notFound("We could not find that order.");

  const shipment = await shipments.findByOrderId(order._id);

  if (!shipment) {
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      awbCode: null,
      courierName: null,
      trackingUrl: null,
      estimatedDeliveryAt: null,
      events: [],
    };
  }

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    awbCode: shipment.awbCode ?? null,
    courierName: shipment.courierName ?? null,
    trackingUrl: shipment.trackingUrl ?? null,
    estimatedDeliveryAt: shipment.estimatedDeliveryAt ?? null,
    // Newest first for display; stored oldest-first.
    events: [...shipment.trackingEvents].reverse(),
  };
}

/**
 * Applies a Shiprocket tracking webhook.
 *
 * Courier scans arrive duplicated and out of order — "in transit" can land
 * after "out for delivery". So the events are appended (deduplicated) and the
 * order status is moved only when the state machine allows it. That is what
 * stops a late scan from walking a DELIVERED order backwards to SHIPPED.
 */
export async function handleTrackingWebhook(input: {
  apiKeyHeader: string | null;
  body: {
    awb?: string | number;
    current_status?: string;
    order_id?: string;
    etd?: string;
    scans?: Array<{
      date?: string;
      activity?: string;
      location?: string;
      "sr-status-label"?: string;
      status?: string;
    }>;
  };
}) {
  if (!shiprocket.verifyWebhookToken(input.apiKeyHeader)) {
    throw ApiError.unauthenticated("Invalid webhook token");
  }

  const awbCode = input.body.awb ? String(input.body.awb) : null;
  if (!awbCode) return { handled: false, reason: "No AWB in payload" };

  const shipment = await shipments.findByAwb(awbCode);
  if (!shipment) return { handled: false, reason: `No shipment for AWB ${awbCode}` };

  const scans = (input.body.scans ?? []).map((scan) => ({
    status: scan["sr-status-label"] ?? scan.status ?? "UPDATE",
    description: scan.activity ?? "",
    location: scan.location ?? "",
    occurredAt: scan.date ? new Date(scan.date) : new Date(),
  }));

  if (scans.length > 0) {
    await shipments.appendTrackingEvents(shipment._id, scans);
  }

  const courierStatus = input.body.current_status ?? "";
  const orderStatus = mapCourierStatus(courierStatus);

  await shipments.update(shipment._id, {
    status: courierStatus || shipment.status,
    ...(input.body.etd ? { estimatedDeliveryAt: new Date(input.body.etd) } : {}),
    ...(orderStatus === "SHIPPED" && !shipment.shippedAt ? { shippedAt: new Date() } : {}),
    ...(orderStatus === "DELIVERED" && !shipment.deliveredAt
      ? { deliveredAt: new Date() }
      : {}),
  });

  if (!orderStatus) return { handled: true, reason: `No order transition for "${courierStatus}"` };

  const order = await orders.findById(String(shipment.orderId));
  if (!order) return { handled: false, reason: "Shipment has no order" };

  // `shouldApplyTransition` rather than `assertTransition`: an out-of-order or
  // repeated scan is normal courier traffic, not a 409.
  if (!shouldApplyTransition(order.status, orderStatus)) {
    return { handled: true, reason: `${order.status} → ${orderStatus} not applicable` };
  }

  await orders.transition(order._id, orderStatus, order.status, {
    note: `Courier update: ${courierStatus}`,
    set: orderStatus === "DELIVERED" ? { deliveredAt: new Date() } : {},
  });

  return { handled: true };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Courier status text → order status.
 *
 * Shiprocket's labels vary by courier, so this matches on substrings rather
 * than exact strings, and returns null for anything unrecognised. Null means
 * "record the scan, do not move the order" — inventing a transition from an
 * unknown label is how an order gets marked delivered by an "RTO initiated"
 * scan.
 */
function mapCourierStatus(status: string): OrderStatus | null {
  const value = status.toUpperCase();

  if (value.includes("DELIVERED")) return "DELIVERED";
  if (value.includes("OUT FOR DELIVERY")) return "OUT_FOR_DELIVERY";
  if (value.includes("RTO") || value.includes("RETURN")) return "RETURN_REQUESTED";
  if (
    value.includes("SHIPPED") ||
    value.includes("IN TRANSIT") ||
    value.includes("PICKED UP")
  ) {
    return "SHIPPED";
  }

  return null;
}

/**
 * Parcel weight, declared to the courier in kilograms.
 *
 * The catalogue no longer stores a per-piece weight — these are light plated
 * pieces where the box, insert and mailer dominate — so the configured flat
 * parcel weight is what gets declared, nudged up for multi-item orders.
 *
 * The floor matters because couriers bill a minimum slab anyway: declaring
 * 0.02 kg for a pair of studs gets the shipment queried rather than saving
 * anything. If heavier lines ever enter the catalogue, put a weight back on the
 * product and sum it here.
 */
function parcelWeightKg(items: Array<{ quantity: number }>): number {
  const { parcel } = shiprocketConfig() ?? { parcel: { weightKg: 0.3 } };

  const pieces = items.reduce((total, item) => total + item.quantity, 0);
  // 30g per additional piece: another pouch and its insert, not the jewellery.
  const extraKg = Math.max(0, pieces - 1) * 0.03;

  return Math.max(parcel.weightKg, Number((parcel.weightKg + extraKg).toFixed(2)));
}
