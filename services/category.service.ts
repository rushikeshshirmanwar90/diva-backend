import { ApiError } from "@/lib/api/errors";
import { uniqueSlug } from "@/lib/slug";
import * as categories from "@/repositories/category.repository";
import type { z } from "zod";
import type { createCategorySchema, updateCategorySchema } from "@/validators/catalog";

type CreateInput = z.infer<typeof createCategorySchema>;
type UpdateInput = z.infer<typeof updateCategorySchema>;

export async function listCategories(options: {
  parentId?: string;
  rootOnly?: boolean;
  includeInactive?: boolean;
  featured?: boolean;
}) {
  return categories.list(options);
}

/**
 * The nav tree, assembled in memory.
 *
 * One query for every category, then a single pass to nest them — rather than a
 * recursive query per level. A jewellery catalogue has tens of categories, not
 * thousands, so fetching them all costs less than the round trips would.
 */
export async function getCategoryTree(options: { includeInactive?: boolean } = {}) {
  const all = await categories.list({ includeInactive: options.includeInactive });

  type Node = (typeof all)[number] & { children: Node[] };

  const byId = new Map<string, Node>();
  for (const category of all) {
    byId.set(String(category._id), { ...category, children: [] });
  }

  const roots: Node[] = [];

  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(String(node.parentId)) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

export async function getCategoryBySlug(slug: string) {
  const category = await categories.findBySlug(slug);
  if (!category) throw ApiError.notFound("We could not find that category.");
  return category;
}

export async function createCategory(input: CreateInput) {
  if (input.parentId) await assertParentExists(input.parentId);

  const slug = input.slug
    ? await ensureSlugFree(input.slug)
    : await uniqueSlug(input.name, (candidate) => categories.slugExists(candidate));

  const created = await categories.create({ ...input, slug } as never);
  await categories.rebuildAncestors(String(created._id));

  return categories.findById(String(created._id));
}

export async function updateCategory(id: string, input: UpdateInput) {
  const existing = await categories.findById(id);
  if (!existing) throw ApiError.notFound("We could not find that category.");

  if (input.parentId) {
    await assertParentExists(input.parentId);
    assertNotOwnAncestor(id, input.parentId, existing.ancestorIds.map(String));
  }

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    slug = await ensureSlugFree(input.slug, id);
  }

  const updated = await categories.updateById(id, { ...input, slug } as never);
  if (!updated) throw ApiError.notFound("We could not find that category.");

  // Re-parenting invalidates the denormalised path of the whole subtree.
  if (input.parentId !== undefined) {
    await categories.rebuildAncestors(id);
  }

  return updated;
}

/**
 * Deletes a category, refusing when it is still in use.
 *
 * Both checks exist because the alternative is orphaned data with no error:
 * a deleted parent leaves children unreachable from the nav, and a deleted
 * category leaves products filed under an id that resolves to nothing.
 */
export async function deleteCategory(id: string) {
  const childCount = await categories.countChildren(id);

  if (childCount > 0) {
    throw ApiError.conflict(
      `This category has ${childCount} sub-categor${childCount === 1 ? "y" : "ies"}. Move or delete those first.`,
    );
  }

  const productCount = await categories.countProducts(id);

  if (productCount > 0) {
    throw ApiError.conflict(
      `${productCount} product${productCount === 1 ? " is" : "s are"} still in this category. Reassign them first.`,
    );
  }

  const deleted = await categories.softDelete(id);
  if (!deleted) throw ApiError.notFound("We could not find that category.");

  return { deleted: true };
}

// ---------------------------------------------------------------------------

async function ensureSlugFree(slug: string, exceptId?: string): Promise<string> {
  if (await categories.slugExists(slug, exceptId)) {
    throw ApiError.conflict(`The slug "${slug}" is already in use.`);
  }
  return slug;
}

async function assertParentExists(parentId: string): Promise<void> {
  const parent = await categories.findById(parentId);
  if (!parent) throw ApiError.badRequest("The chosen parent category does not exist.");
}

/**
 * Blocks a category becoming its own ancestor.
 *
 * A cycle in the tree makes `rebuildAncestors` recurse until its depth cap and
 * makes the nav render an infinite menu. Cheap to prevent, tedious to unpick.
 */
function assertNotOwnAncestor(id: string, parentId: string, ancestorIds: string[]): void {
  if (parentId === id || ancestorIds.includes(id)) {
    throw ApiError.badRequest("A category cannot be nested inside itself.");
  }
}
