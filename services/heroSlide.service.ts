import { ApiError } from "@/lib/api/errors";
import * as heroSlides from "@/repositories/heroSlide.repository";
import type { CreateHeroSlideInput, UpdateHeroSlideInput } from "@/validators/hero";

export async function listActive() {
  return heroSlides.listActive();
}

export async function listAll() {
  return heroSlides.listAll();
}

export async function createSlide(input: CreateHeroSlideInput) {
  return heroSlides.create(input as never);
}

export async function updateSlide(id: string, input: UpdateHeroSlideInput) {
  const updated = await heroSlides.updateById(id, input as never);
  if (!updated) throw ApiError.notFound("We could not find that slide.");
  return updated;
}

export async function deleteSlide(id: string) {
  const deleted = await heroSlides.softDelete(id);
  if (!deleted) throw ApiError.notFound("We could not find that slide.");
  return { deleted: true };
}
