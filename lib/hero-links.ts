/**
 * Where a hero slide's button may point — a fixed list, not a free-text URL.
 *
 * Plain data, no imports: `validators/hero.ts` needs it (which pulls in
 * `mongoose` transitively through `validators/common.ts`) and the admin
 * "Home" page needs it too, from a `"use client"` component that can never
 * bundle `mongoose`. Living here, with nothing else in the module, is what
 * lets both sides import the same list without either dragging the other's
 * dependencies along.
 */
export const HERO_LINK_OPTIONS = [
  { label: "Shop all jewellery", href: "/shop" },
  { label: "Collections", href: "/collections" },
  { label: "Wishlist", href: "/wishlist" },
  { label: "My account", href: "/account" },
  { label: "About us", href: "/about" },
  { label: "Contact & stores", href: "/contact" },
] as const;

/** The fixed storefront sections above — routes that exist in the codebase. */
export type HeroSectionHref = (typeof HERO_LINK_OPTIONS)[number]["href"];

/**
 * Category destinations cannot join the list above, because they are rows in a
 * collection rather than routes in the codebase — the set changes whenever an
 * admin adds or renames a category, so it has to be resolved at runtime.
 *
 * That loses the guarantee the fixed list gave for free: an enum cannot name a
 * category that does not exist. The shape check here only proves the href
 * *looks* like a category path, so `heroSlide.service.ts` re-checks the slug
 * against the database before saving. Without that second step this would
 * happily store `/category/anything-at-all`.
 */
export const CATEGORY_HREF_PREFIX = "/category/";

/** Matches `validators/common.ts`'s `slug`, which is what categories are saved with. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type HeroCategoryHref = `${typeof CATEGORY_HREF_PREFIX}${string}`;

export type HeroLinkHref = HeroSectionHref | HeroCategoryHref;

export function categoryHref(slug: string): HeroCategoryHref {
  return `${CATEGORY_HREF_PREFIX}${slug}`;
}

/** The slug in a category href, or `null` if it is not a well-formed one. */
export function categorySlugFromHref(href: string): string | null {
  if (!href.startsWith(CATEGORY_HREF_PREFIX)) return null;
  const slug = href.slice(CATEGORY_HREF_PREFIX.length);
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export function isHeroSectionHref(href: string): boolean {
  return HERO_LINK_OPTIONS.some((option) => option.href === href);
}

/** Shape-only. Says nothing about whether the category exists — see above. */
export function isHeroLinkHref(href: string): boolean {
  return isHeroSectionHref(href) || categorySlugFromHref(href) !== null;
}
