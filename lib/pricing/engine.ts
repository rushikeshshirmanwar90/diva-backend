import { percentOf, type Paise } from "@/lib/money";

/**
 * The pricing engine.
 *
 * One function computes every price in the system — product listing, product
 * page, cart, checkout, invoice. If two code paths can compute a price, they
 * will eventually disagree, and the disagreement surfaces as a customer being
 * charged something other than what they were shown.
 *
 * ## The formula
 *
 *   pre-tax  = the product's stored `pricePaise`
 *   GST      = pre-tax × gst%
 *   ─────────────────────────────────────────
 *   total    = pre-tax + GST
 *
 * That is the whole of it. This catalogue is fixed-price 1-gram-gold, so a
 * price is typed once by an admin and stored, not derived from a live metal
 * rate. Variants (colour, size) do not move the price.
 *
 * The function is kept — rather than reading `product.pricePaise` at each call
 * site — because it is the single place where "is this thing sellable?" is
 * decided, and because GST arithmetic belongs in exactly one place.
 */

export type PriceBreakdown = {
  /** What one unit costs before tax. */
  subtotalPaise: Paise;
  gstPercent: number;
  gstPaise: Paise;
  /** What the customer pays for one unit. */
  totalPaise: Paise;
};

/** The subset of a product the engine needs. Keeps it testable without Mongo. */
export type PriceableProduct = {
  pricePaise: number;
  gstPercent: number;
};

export class PricingError extends Error {}

/**
 * Prices one unit of a product.
 *
 * Throws when the product has no positive price rather than returning zero. A
 * silent zero renders a ₹1,299 piece as free and makes it purchasable — an
 * error far cheaper to hit as an exception than as a completed order. It is
 * also the state every product imported from the old rate-based catalogue
 * starts in, so it must fail loudly rather than sell at ₹0.
 */
export function priceProduct(product: PriceableProduct): PriceBreakdown {
  const subtotalPaise = product.pricePaise ?? 0;

  if (subtotalPaise <= 0) {
    throw new PricingError("This product has no price set.");
  }

  const gstPercent = product.gstPercent ?? 0;
  const gstPaise = percentOf(subtotalPaise, gstPercent);

  return {
    subtotalPaise,
    gstPercent,
    gstPaise,
    totalPaise: subtotalPaise + gstPaise,
  };
}

/**
 * Prices a product, or returns null when it cannot be priced.
 *
 * The listing path's counterpart to `priceProduct`: one unpriced product should
 * grey out its own card, not throw and blank an entire category page.
 */
export function tryPriceProduct(product: PriceableProduct): PriceBreakdown | null {
  try {
    return priceProduct(product);
  } catch (error) {
    if (error instanceof PricingError) return null;
    throw error;
  }
}
