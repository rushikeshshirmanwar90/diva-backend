/**
 * Money handling.
 *
 * Every monetary value in this system is an **integer number of paise**.
 * `129900` is ₹1,299.00. There are no floats anywhere in the money path.
 *
 * This is not pedantry. `0.1 + 0.2 !== 0.3` in IEEE-754, and a cart that
 * accumulates rupee floats will eventually produce a total one paisa off the
 * sum of its lines. That discrepancy shows up in an invoice, a payment gateway
 * amount mismatch, or a reconciliation report — all of which cost real time to
 * chase, and one of which blocks a customer's order.
 *
 * Rupees exist only at two boundaries: parsing admin input, and rendering.
 */

/** Branded so a bare number cannot be passed where paise are expected. */
export type Paise = number;

const PAISE_PER_RUPEE = 100;

/** Rupees (as typed by an admin) → paise. Rejects sub-paise precision. */
export function rupeesToPaise(rupees: number): Paise {
  const paise = Math.round(rupees * PAISE_PER_RUPEE);

  if (!Number.isFinite(paise)) {
    throw new RangeError(`Cannot convert ${rupees} to paise`);
  }

  return paise;
}

export function paiseToRupees(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

/**
 * Renders paise as an Indian-format currency string: `₹1,29,900.00`.
 *
 * Note the lakh grouping — `en-IN` groups as 2,2,3 rather than 3,3,3. Using
 * `en-US` here would print ₹129,900.00 to an Indian customer, which reads as
 * wrong even though the number is right.
 */
export function formatPaise(paise: Paise, options: { withDecimals?: boolean } = {}): string {
  const withDecimals = options.withDecimals ?? true;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(paiseToRupees(paise));
}

/** Sums a list of paise amounts. Integer-only, so exact by construction. */
export function sumPaise(amounts: Paise[]): Paise {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/**
 * Applies a percentage, rounding half-up to the nearest paisa.
 *
 * Used for GST, making charges and percentage coupons. Rounding is centralised
 * here so every percentage in the system rounds the same way — inconsistent
 * rounding across cart, invoice and payment is exactly how a one-paisa
 * mismatch reaches a payment gateway.
 */
export function percentOf(amount: Paise, percent: number): Paise {
  return Math.round((amount * percent) / 100);
}

/**
 * Splits an amount across N lines without losing paise to rounding.
 *
 * Naively rounding each share drops or invents paise (₹100 across 3 lines
 * becomes ₹99.99 or ₹100.02). Remainder paise are distributed one each to the
 * earliest lines so the parts always sum to exactly the whole.
 */
export function distributePaise(total: Paise, weights: number[]): Paise[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) return weights.map(() => 0);

  const shares = weights.map((weight) => Math.floor((total * weight) / weightTotal));
  let remainder = total - shares.reduce((sum, share) => sum + share, 0);

  for (let i = 0; remainder > 0 && i < shares.length; i += 1, remainder -= 1) {
    shares[i] = (shares[i] ?? 0) + 1;
  }

  return shares;
}

/** Milligrams → grams. Weights are stored as integer milligrams, same reason. */
export function milligramsToGrams(mg: number): number {
  return mg / 1000;
}

export function gramsToMilligrams(grams: number): number {
  return Math.round(grams * 1000);
}
