import { SettingModel, type SettingDocument } from "@/models/Setting";

/**
 * Store settings, cached in process.
 *
 * Checkout reads these on every request — free-shipping threshold, flat rate,
 * blocked pincodes, the price-lock window — and they change perhaps monthly. A
 * database round trip per cart calculation buys nothing.
 *
 * The TTL is a minute, matching `lib/pricing/rates.ts`, so a change made in
 * admin is live within a minute on every worker without any invalidation
 * broadcast. `invalidateSettingsCache()` makes it immediate on the worker that
 * handled the write.
 */

const CACHE_TTL_MS = 60_000;

type CacheEntry = { settings: SettingDocument; loadedAt: number };

let cache: CacheEntry | null = null;

/**
 * The singleton `store` settings row, created with schema defaults if absent.
 *
 * Upsert rather than "read, and throw if missing": a fresh database should be
 * able to serve a checkout without someone having remembered to run a seed.
 */
export async function getStoreSettings(options: { fresh?: boolean } = {}) {
  if (!options.fresh && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.settings;
  }

  const settings = await SettingModel.findOneAndUpdate(
    { key: "store" },
    { $setOnInsert: { key: "store" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean();

  cache = { settings: settings as SettingDocument, loadedAt: Date.now() };
  return cache.settings;
}

export function invalidateSettingsCache(): void {
  cache = null;
}

/**
 * Whether a pincode is on the manual block list.
 *
 * Distinct from Shiprocket serviceability: this is the shop's own decision —
 * high-fraud areas, places their insurer will not cover — and it applies even
 * when a courier would happily deliver.
 */
export function isPincodeBlocked(pincode: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => prefix.length > 0 && pincode.startsWith(prefix));
}
