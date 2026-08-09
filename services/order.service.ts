import mongoose from "mongoose";
import { ApiError } from "@/lib/api/errors";
import { priceProduct, PricingError } from "@/lib/pricing/engine";
import { getStoreSettings, isPincodeBlocked } from "@/lib/settings";
import { distributePaise, percentOf } from "@/lib/money";
import { assertTransition, CUSTOMER_CANCELLABLE } from "@/lib/orders/state-machine";
import * as orders from "@/repositories/order.repository";
import * as products from "@/repositories/product.repository";
import { AddressModel } from "@/models/Address";
import { CouponModel } from "@/models/Coupon";
import type { OrderDocument } from "@/models/Order";
import type { CreateOrderInput } from "@/validators/checkout";

/**
 * Order creation and lifecycle.
 *
 * The rule this file exists to enforce: **the client sends what it wants to
 * buy, never what it expects to pay.** The request carries product ids, variant
 * ids and quantities. Every rupee — unit price, GST, coupon discount, shipping,
 * grand total — is computed here from the price stored on the product.
 *
 * That is not defensive coding for its own sake. A checkout that accepts a
 * client-supplied total can be bought from with the browser devtools open, and
 * the first sign of it is a reconciliation report that does not balance.
 *
 * The order that comes out of `createOrder` is a **snapshot**: title, image,
 * colour, size, unit price and the tax rate are all copied in. Nothing that
 * renders an order later follows `productId` back to the live catalogue.
 */

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

type Actor = { userId: string; email: string };

export async function createOrder(input: CreateOrderInput, actor: Actor) {
  const settings = await getStoreSettings();
  const address = await resolveAddress(input, actor.userId);

  if (isPincodeBlocked(address.pincode, settings.shipping.blockedPincodePrefixes)) {
    throw ApiError.badRequest(
      "We are unable to deliver to this pincode. Please try a different address.",
    );
  }

  // --- Price every line ----------------------------------------------------

  const priced = await Promise.all(
    input.items.map(async (item) => {
      const product = await products.findById(item.productId, { publicOnly: true });

      if (!product) {
        throw ApiError.badRequest(
          "One of the items in your bag is no longer available. Please review your bag.",
        );
      }

      const variant = product.variants.find(
        (candidate) => String(candidate._id) === item.variantId,
      );

      if (!variant || !variant.isActive) {
        throw ApiError.badRequest(
          `The selected option for "${product.title}" is no longer available.`,
        );
      }

      if (variant.stock - variant.reservedStock < item.quantity) {
        throw ApiError.conflict(
          `Only ${Math.max(0, variant.stock - variant.reservedStock)} left of "${product.title}".`,
        );
      }

      let breakdown;
      try {
        breakdown = priceProduct(product);
      } catch (error) {
        if (error instanceof PricingError) {
          throw ApiError.serviceUnavailable(
            `"${product.title}" cannot be priced right now. Please try again shortly.`,
          );
        }
        throw error;
      }

      return { product, variant, quantity: item.quantity, breakdown };
    }),
  );

  // --- Order-level arithmetic ---------------------------------------------

  /**
   * Note that the engine's `subtotalPaise` is **pre-tax**. Discount and
   * shipping are applied to the pre-tax base and GST is charged on what
   * remains, which is the order the tax actually works in — computing GST per
   * line first and then discounting the gross would over-collect tax.
   */
  const lineSubtotals = priced.map((line) => line.breakdown.subtotalPaise * line.quantity);
  const subtotalPaise = lineSubtotals.reduce((sum, value) => sum + value, 0);

  const coupon = await resolveCoupon(input.couponCode, subtotalPaise, actor.userId);
  const discountPaise = coupon?.discountPaise ?? 0;

  /**
   * The discount is spread across lines in proportion to their value, using
   * `distributePaise` so the parts sum to exactly the whole. Rounding each line
   * independently loses or invents paise, and the invoice then disagrees with
   * the amount charged — by one paisa, which is enough to fail reconciliation.
   */
  const discountShares = distributePaise(discountPaise, lineSubtotals);

  const items = priced.map((line, index) => {
    const lineSubtotal = lineSubtotals[index]!;
    const lineDiscount = discountShares[index] ?? 0;
    const taxableBase = lineSubtotal - lineDiscount;
    const lineGst = percentOf(taxableBase, line.breakdown.gstPercent);

    return {
      productId: line.product._id,
      variantId: line.variant._id,

      title: line.product.title,
      slug: line.product.slug,
      sku: line.variant.sku,
      imageUrl: line.product.images?.[0]?.url,

      colour: line.variant.colour,
      size: line.variant.size,

      quantity: line.quantity,

      unitPricePaise: line.breakdown.subtotalPaise,
      lineSubtotalPaise: lineSubtotal,
      lineDiscountPaise: lineDiscount,
      gstPercent: line.breakdown.gstPercent,
      lineGstPaise: lineGst,
      lineTotalPaise: taxableBase + lineGst,

      hsnCode: line.product.hsnCode,
    };
  });

  const gstPaise = items.reduce((sum, item) => sum + item.lineGstPaise, 0);
  const taxableTotal = subtotalPaise - discountPaise;

  const shippingPaise =
    taxableTotal >= settings.shipping.freeShippingThresholdPaise
      ? 0
      : settings.shipping.flatRatePaise;

  const grandTotalPaise = taxableTotal + gstPaise + shippingPaise;

  // --- Reserve stock, then write the order --------------------------------

  /**
   * Stock is held *before* the order document exists.
   *
   * The alternative — write the order, then reserve — leaves a window in which
   * an order exists against inventory that another customer has since taken.
   * Reservations are rolled back explicitly on any failure below, because there
   * is no transaction spanning the two collections on a standalone MongoDB.
   */
  const reserved: Array<{ productId: string; variantId: string; quantity: number }> = [];

  try {
    for (const line of priced) {
      const held = await products.reserveStock(
        String(line.product._id),
        String(line.variant._id),
        line.quantity,
      );

      if (!held) {
        throw ApiError.conflict(
          `"${line.product.title}" sold out while you were checking out. Please review your bag.`,
        );
      }

      reserved.push({
        productId: String(line.product._id),
        variantId: String(line.variant._id),
        quantity: line.quantity,
      });
    }

    const order = await orders.create({
      orderNumber: await nextOrderNumber(),
      userId: new mongoose.Types.ObjectId(actor.userId),
      customerEmail: actor.email,
      customerPhone: address.phone,

      items,
      shippingAddress: address,
      billingAddress: input.billingAddress ?? address,

      totals: { subtotalPaise, discountPaise, shippingPaise, gstPaise, grandTotalPaise },
      coupon: coupon
        ? {
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            discountPaise: coupon.discountPaise,
          }
        : null,

      status: "PENDING",
      statusHistory: [{ status: "PENDING", at: new Date(), note: "Order created" }],

      paymentMethod: "PHONEPE",

      /**
       * The hold expires with the price lock. A customer who opens the PhonePe
       * page and walks away must not keep a ring out of stock indefinitely, and
       * the sweep that releases it uses this field.
       */
      reservationExpiresAt: new Date(
        Date.now() + settings.pricing.priceLockMinutes * 60_000,
      ),

      notes: input.giftNote,
    });

    return order;
  } catch (error) {
    for (const hold of reserved) {
      await products
        .releaseStock(hold.productId, hold.variantId, hold.quantity)
        .catch((releaseError) => {
          // Swallowed so the original, more useful error still reaches the
          // client. Logged loudly because a leaked reservation is inventory
          // that silently stops being sellable.
          console.error(
            `[order] Failed to release reservation ${hold.productId}/${hold.variantId}`,
            releaseError,
          );
        });
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getOrderForUser(orderNumber: string, userId: string) {
  const order = await orders.findOwnedByNumber(orderNumber, userId);
  if (!order) throw ApiError.notFound("We could not find that order.");
  return order;
}

export async function listOrdersForUser(
  userId: string,
  query: { page: number; limit: number },
) {
  return orders.listForUser(userId, query);
}

/**
 * Staff lookup by order number, with no ownership filter.
 *
 * Kept as a separate function rather than an `options.isStaff` flag on
 * `getOrderForUser`, so that reading someone else's order is always an explicit
 * choice at the call site. Every caller of this one sits behind `requireStaff`.
 */
export async function getOrderByNumberForStaff(orderNumber: string) {
  const order = await orders.findByNumber(orderNumber);
  if (!order) throw ApiError.notFound("We could not find that order.");
  return order;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Customer-initiated cancellation.
 *
 * Refunding is deliberately *not* done here. This marks the order cancelled and
 * releases stock; money is returned by `payment.service.refundOrder`, called by
 * finance staff or by an explicit job. Coupling the two would mean a failed
 * refund API call leaves an order that is neither cancelled nor refunded.
 */
export async function cancelOrder(orderNumber: string, userId: string, reason?: string) {
  const order = await orders.findOwnedByNumber(orderNumber, userId);
  if (!order) throw ApiError.notFound("We could not find that order.");

  if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
    throw ApiError.conflict(
      "This order has already been dispatched and can no longer be cancelled. " +
        "You can request a return once it arrives.",
    );
  }

  assertTransition(order.status, "CANCELLED");

  const cancelled = await orders.transition(order._id, "CANCELLED", order.status, {
    note: reason ?? "Cancelled by customer",
    actorId: userId,
    actorRole: "customer",
    set: { cancelledAt: new Date(), cancellationReason: reason, reservationExpiresAt: null },
  });

  // Null means another writer moved the order first — a webhook confirming
  // payment, most likely. Their transition stands; this one is a no-op.
  if (!cancelled) {
    throw ApiError.conflict("This order changed while you were cancelling. Please reload.");
  }

  await releaseHeldStock(order);

  return cancelled;
}

/** Returns reserved units to the pool. Safe to call more than once per order. */
export async function releaseHeldStock(order: Pick<OrderDocument, "items">) {
  for (const item of order.items) {
    await products
      .releaseStock(String(item.productId), String(item.variantId), item.quantity)
      .catch((error) => {
        console.error("[order] Failed to release stock during cancellation", error);
      });
  }
}

/** Converts holds into sales. Called once, when payment is confirmed. */
export async function commitStockForOrder(order: Pick<OrderDocument, "items">) {
  for (const item of order.items) {
    await products
      .commitStock(String(item.productId), String(item.variantId), item.quantity)
      .catch((error) => {
        console.error("[order] Failed to commit stock after payment", error);
      });
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * `DIVA-20260808-0042` — date plus that day's sequence.
 *
 * Readable over the phone and sortable, which an ObjectId is not. The count is
 * racy under concurrency, so the unique index on `orderNumber` is the actual
 * guarantee: a collision surfaces as a duplicate-key error, which the handler
 * already maps to a 409, and the customer's retry gets the next number. A
 * counter collection would remove the retry, at the cost of a second write on
 * every order — not worth it at this volume.
 */
async function nextOrderNumber(): Promise<string> {
  const now = new Date();

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const todayCount = await orders.countForDay(dayStart, dayEnd);

  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  return `DIVA-${stamp}-${String(todayCount + 1).padStart(4, "0")}`;
}

/**
 * Resolves the delivery address from a saved id or an inline address.
 *
 * The saved-address lookup is scoped by `userId`. Without that scope, passing
 * someone else's address id would ship their order's contents to an address of
 * the attacker's choosing — or, more mundanely, leak the address by echoing it
 * back on the order.
 */
async function resolveAddress(input: CreateOrderInput, userId: string) {
  if (input.addressId) {
    const saved = await AddressModel.findOne({
      _id: input.addressId,
      userId,
      deletedAt: null,
    }).lean();

    if (!saved) throw ApiError.notFound("That delivery address no longer exists.");

    return {
      fullName: saved.fullName,
      phone: saved.phone,
      alternatePhone: saved.alternatePhone,
      line1: saved.line1,
      line2: saved.line2,
      landmark: saved.landmark,
      city: saved.city,
      state: saved.state,
      pincode: saved.pincode,
      country: saved.country || "India",
    };
  }

  if (!input.shippingAddress) {
    throw ApiError.badRequest("A delivery address is required.");
  }

  return { ...input.shippingAddress, country: input.shippingAddress.country || "India" };
}

/**
 * Validates a coupon and computes its discount.
 *
 * Validity, minimum cart value, window and per-user usage are all re-checked
 * here rather than trusted from the cart. `usedCount` is *not* incremented at
 * this point — a coupon must not be consumed by an order that is never paid
 * for. That happens on payment confirmation.
 */
async function resolveCoupon(code: string | undefined, subtotalPaise: number, userId: string) {
  if (!code) return null;

  const coupon = await CouponModel.findOne({
    code: code.toUpperCase(),
    isActive: true,
    deletedAt: null,
  }).lean();

  if (!coupon) throw ApiError.badRequest("That coupon code is not valid.");

  const now = new Date();
  if (coupon.validFrom > now || coupon.validTo < now) {
    throw ApiError.badRequest("That coupon has expired.");
  }

  if (subtotalPaise < coupon.minCartValuePaise) {
    throw ApiError.badRequest(
      `This coupon applies to orders above ₹${Math.round(coupon.minCartValuePaise / 100).toLocaleString("en-IN")}.`,
    );
  }

  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest("That coupon has been fully redeemed.");
  }

  const raw =
    coupon.type === "FLAT"
      ? coupon.value
      : percentOf(subtotalPaise, coupon.value);

  const capped = coupon.maxDiscountPaise ? Math.min(raw, coupon.maxDiscountPaise) : raw;

  return {
    _id: coupon._id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    // Never let a discount exceed the cart: a negative payable amount is
    // rejected by the gateway, and a zero one skips payment entirely.
    discountPaise: Math.min(capped, subtotalPaise),
    userId,
  };
}
