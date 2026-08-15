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

export type HeroLinkHref = (typeof HERO_LINK_OPTIONS)[number]["href"];
