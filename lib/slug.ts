/**
 * URL slug generation.
 *
 * Slugs are part of the public URL surface and therefore part of the SEO
 * surface. Once `/product/emerald-halo-ring` is indexed and linked, changing it
 * costs ranking, so slugs are generated once at creation and only changed
 * deliberately.
 */

/**
 * Normalises text into a URL-safe slug.
 *
 * NFD decomposition splits accented characters into base + combining mark, and
 * the combining marks are then stripped — so "Rosé" becomes "rose" rather than
 * "ros". Product titles routinely carry accents from French and Italian design
 * vocabulary.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/g, "");
}

/**
 * Produces a slug that does not collide with existing ones.
 *
 * `isTaken` is injected rather than querying here, because this module must
 * stay free of database access — collision checking belongs to the repository
 * that owns the collection.
 */
export async function uniqueSlug(
  input: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(input) || "item";

  if (!(await isTaken(base))) return base;

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  // Fall back to a random suffix rather than looping forever. Reaching this
  // means 50 products share a title, which is worth the uglier URL.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
