import { ApiError } from "@/lib/api/errors";
import { uniqueSlug } from "@/lib/slug";
import * as collections from "@/repositories/collection.repository";
import type { z } from "zod";
import type { createCollectionSchema, updateCollectionSchema } from "@/validators/catalog";

type CreateInput = z.infer<typeof createCollectionSchema>;
type UpdateInput = z.infer<typeof updateCollectionSchema>;

export async function listCollections(options: {
  includeInactive?: boolean;
  featured?: boolean;
  liveOnly?: boolean;
}) {
  return collections.list(options);
}

export async function getCollectionBySlug(slug: string, options: { isStaff: boolean }) {
  const collection = await collections.findBySlug(slug);

  if (!collection) throw ApiError.notFound("We could not find that collection.");

  /**
   * A scheduled or expired campaign is a 404 for the public.
   *
   * Not a 403: the existence of an unreleased Diwali collection is itself
   * information, and a 403 confirms the slug is real.
   */
  if (!options.isStaff && !isLive(collection)) {
    throw ApiError.notFound("We could not find that collection.");
  }

  return collection;
}

export async function createCollection(input: CreateInput) {
  const slug = input.slug
    ? await ensureSlugFree(input.slug)
    : await uniqueSlug(input.name, (candidate) => collections.slugExists(candidate));

  const created = await collections.create({
    ...input,
    slug,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  } as never);

  await collections.syncProductMembership(String(created._id), input.productIds ?? []);

  return collections.findById(String(created._id));
}

export async function updateCollection(id: string, input: UpdateInput) {
  const existing = await collections.findById(id);
  if (!existing) throw ApiError.notFound("We could not find that collection.");

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    slug = await ensureSlugFree(input.slug, id);
  }

  const updated = await collections.updateById(id, {
    ...input,
    slug,
    ...(input.startsAt !== undefined
      ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
      : {}),
    ...(input.endsAt !== undefined
      ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
      : {}),
  } as never);

  if (!updated) throw ApiError.notFound("We could not find that collection.");

  // Only touch the product-side mirror when membership was actually submitted;
  // a PATCH that renames a collection must not empty it.
  if (input.productIds) {
    await collections.syncProductMembership(id, input.productIds);
  }

  return updated;
}

export async function deleteCollection(id: string) {
  const deleted = await collections.softDelete(id);
  if (!deleted) throw ApiError.notFound("We could not find that collection.");

  // Clear the mirror so no product keeps pointing at a deleted collection.
  await collections.syncProductMembership(id, []);

  return { deleted: true };
}

function isLive(collection: { isActive: boolean; startsAt?: Date | null; endsAt?: Date | null }) {
  const now = new Date();

  if (!collection.isActive) return false;
  if (collection.startsAt && now < collection.startsAt) return false;
  if (collection.endsAt && now > collection.endsAt) return false;

  return true;
}

async function ensureSlugFree(slug: string, exceptId?: string): Promise<string> {
  if (await collections.slugExists(slug, exceptId)) {
    throw ApiError.conflict(`The slug "${slug}" is already in use.`);
  }
  return slug;
}
