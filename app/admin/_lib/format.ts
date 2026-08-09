/**
 * Display formatting for the admin console.
 *
 * The design mocks showed dollar amounts (`$2,840`). This store is Indian and
 * every amount on the wire is an integer count of paise, so nothing here takes
 * a rupee float — passing one in is how a ₹48,999 ring renders as ₹489.99.
 */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_COMPACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * Paise → `₹1,29,900.00`.
 *
 * Note the lakh grouping — `en-IN` groups 2,2,3 rather than 3,3,3. Using
 * `en-US` here prints ₹129,900.00, which reads as wrong to an Indian customer
 * even though the number is right.
 */
export function money(paise: number | null | undefined): string {
  if (paise == null) return "—";
  return INR.format(paise / 100);
}

/** Paise → `₹1,29,900`. For metric tiles where decimals are noise. */
export function moneyShort(paise: number | null | undefined): string {
  if (paise == null) return "—";
  return INR_COMPACT.format(paise / 100);
}

export function number(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}

/** Rupee string from a form field → integer paise. Never returns a float. */
export function rupeesToPaise(input: string): number {
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise == null) return "";
  return (paise / 100).toFixed(2);
}

/** "Today, 10:42 AM" / "Yesterday, 4:06 PM" / "Aug 06, 11:32 AM". */
export function when(value: string | Date | null | undefined): string {
  if (!value) return "—";

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const time = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();

  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;

  return `${date.toLocaleDateString("en-IN", { month: "short", day: "2-digit" })}, ${time}`;
}

export function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Re-exported so the console imports every formatter from one place, while the
 * label logic stays next to the normaliser it has to stay in step with.
 */
export { colourLabel } from "@/lib/colour";

/** Turns any label into the two-letter mark the design uses for avatars. */
export function initials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

/**
 * Picks one of the design's six product-mark colours.
 *
 * Hashed from a stable key (the slug) rather than the array index, so a product
 * keeps the same colour as it moves between pages — an index-based choice makes
 * the grid appear to reshuffle its colours on every sort.
 */
const TONES = ["rose", "sand", "lilac", "blue", "slate", "gold"] as const;

export function tone(key: string): (typeof TONES)[number] {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TONES[hash % TONES.length]!;
}
