/**
 * Variant colours.
 *
 * Open, not a closed enum: the suggestions below cover what is normally
 * stocked, but an admin can type anything — "Mint Green", "Antique Silver", a
 * finish nobody has thought of yet.
 *
 * What keeps that from turning the storefront filter into a mess of near
 * duplicates is `toColourValue`. Every colour is normalised to an
 * `UPPER_SNAKE` token before it is stored, so "Rose Gold", "rose gold" and
 * "rose-gold" are all `ROSE_GOLD` — one facet chip, one filter, one group in
 * the inventory list. `colourLabel` turns the token back into something a
 * person reads.
 *
 * Both directions live here rather than beside their callers because the admin
 * form, the validator and the storefront must agree on them exactly. Two copies
 * of this normaliser is how "ROSE_GOLD" and "ROSEGOLD" end up as separate
 * filters that each show half the stock.
 */

/** Offered in the editor's dropdown. Not a constraint — anything else is fine. */
export const COLOUR_SUGGESTIONS = [
  "GOLD",
  "ROSE_GOLD",
  "SILVER",
  "OXIDISED",
  "TWO_TONE",
  "BLACK",
  "MULTI",
] as const;

/** Labels for the suggestions, where title-casing the token is not enough. */
const KNOWN_LABELS: Record<string, string> = {
  GOLD: "Gold",
  ROSE_GOLD: "Rose Gold",
  SILVER: "Silver",
  OXIDISED: "Oxidised",
  TWO_TONE: "Two Tone",
  BLACK: "Black",
  MULTI: "Multi",
};

/**
 * Anything a person typed → the token that gets stored.
 *
 * `"  rose gold "` → `ROSE_GOLD`. `"Antique-Silver"` → `ANTIQUE_SILVER`.
 * Characters that are neither letters nor digits become separators, so a stray
 * `&` or `/` cannot end up inside a value that later has to survive a URL query
 * string.
 *
 * Returns `""` for input with nothing usable in it; callers validate that.
 */
export function toColourValue(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    // Re-trim: the slice above can leave a trailing separator behind.
    .replace(/_+$/g, "");
}

/** `ROSE_GOLD` → `Rose Gold`. Falls back to title-casing an unknown token. */
export function colourLabel(colour: string): string {
  if (!colour) return "—";

  return (
    KNOWN_LABELS[colour] ??
    colour
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ")
  );
}
