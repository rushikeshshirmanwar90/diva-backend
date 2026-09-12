import { ApiError } from "@/lib/api/errors";
import * as heroSlides from "@/repositories/heroSlide.repository";
import * as categories from "@/repositories/category.repository";
import { categorySlugFromHref } from "@/lib/hero-links";
import type { CreateHeroSlideInput, UpdateHeroSlideInput } from "@/validators/hero";

/**
 * The half of hero-link validation that needs the database.
 *
 * `validators/hero.ts` can only prove an href is shaped like a category path.
 * A slide is merchandising shown to every visitor on the homepage, so a button
 * that 404s is worse than a rejected save — this is what keeps the "never
 * points at a typo'd route" guarantee the old fixed enum gave for free.
 *
 * Deliberately does not require `isActive`: an admin routinely builds a slide
 * before switching the category on, and blocking that would be obstructive.
 * The admin dropdown marks hidden categories instead, so the choice is at
 * least visible at the point of picking.
 */
async function assertLinkResolves(href: string | undefined) {
  if (!href) return;

  const slug = categorySlugFromHref(href);
  if (!slug) return; // A fixed storefront section; the schema already vouched for it.

  const category = await categories.findBySlug(slug);
  if (!category) {
    throw ApiError.badRequest(
      `There is no category at "${href}". Pick one from the list.`,
    );
  }
}

export async function listActive() {
  return heroSlides.listActive();
}

export async function listAll() {
  return heroSlides.listAll();
}

export async function createSlide(input: CreateHeroSlideInput) {
  await assertLinkResolves(input.cta.href);
  return heroSlides.create(input as never);
}

export async function updateSlide(id: string, input: UpdateHeroSlideInput) {
  await assertLinkResolves(input.cta?.href);
  const updated = await heroSlides.updateById(id, input as never);
  if (!updated) throw ApiError.notFound("We could not find that slide.");
  return updated;
}

export async function deleteSlide(id: string) {
  const deleted = await heroSlides.softDelete(id);
  if (!deleted) throw ApiError.notFound("We could not find that slide.");
  return { deleted: true };
}
