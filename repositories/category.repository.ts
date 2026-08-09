import { CategoryModel, type CategoryDocument } from "@/models/Category";
import { ProductModel } from "@/models/Product";
import { notDeleted } from "@/models/base";
import type { QueryFilter } from "mongoose";

export async function findBySlug(slug: string) {
  return CategoryModel.findOne({ slug, ...notDeleted }).lean();
}

export async function findById(id: string) {
  return CategoryModel.findOne({ _id: id, ...notDeleted }).lean();
}

export async function findManyByIds(ids: string[]) {
  return CategoryModel.find({ _id: { $in: ids }, ...notDeleted }).lean();
}

export async function slugExists(slug: string, exceptId?: string): Promise<boolean> {
  const filter: QueryFilter<CategoryDocument> = { slug };
  if (exceptId) filter._id = { $ne: exceptId };
  return (await CategoryModel.countDocuments(filter)) > 0;
}

export async function list(options: {
  parentId?: string | null;
  rootOnly?: boolean;
  includeInactive?: boolean;
  featured?: boolean;
}) {
  const filter: QueryFilter<CategoryDocument> = { ...notDeleted };

  if (options.rootOnly) filter.parentId = null;
  else if (options.parentId !== undefined) filter.parentId = options.parentId;

  if (!options.includeInactive) filter.isActive = true;
  if (options.featured) filter.isFeatured = true;

  return CategoryModel.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
}

export async function create(input: Partial<CategoryDocument>) {
  const category = await CategoryModel.create(input);
  return category.toObject();
}

export async function updateById(id: string, update: Partial<CategoryDocument>) {
  return CategoryModel.findOneAndUpdate({ _id: id, ...notDeleted }, update, {
    returnDocument: 'after',
  }).lean();
}

export async function softDelete(id: string) {
  return CategoryModel.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), isActive: false } },
    { returnDocument: 'after' },
  ).lean();
}

/** Direct children, used to block deletion of a category that still has some. */
export async function countChildren(id: string): Promise<number> {
  return CategoryModel.countDocuments({ parentId: id, ...notDeleted });
}

export async function countProducts(id: string): Promise<number> {
  return ProductModel.countDocuments({ categoryIds: id, ...notDeleted });
}

/**
 * Rebuilds `ancestorIds` for a category and everything beneath it.
 *
 * Denormalised ancestry makes "every product under Rings, including
 * sub-categories" a single indexed query. The cost is that re-parenting a
 * category invalidates the paths of its whole subtree, so this walks down and
 * fixes them.
 *
 * Depth is capped at 10 — a category tree deeper than that is a data-entry
 * accident (or a cycle), and an uncapped recursive walk over a cycle never
 * returns.
 */
export async function rebuildAncestors(categoryId: string, depth = 0): Promise<void> {
  if (depth > 10) return;

  const category = await CategoryModel.findById(categoryId).lean();
  if (!category) return;

  let ancestorIds: CategoryDocument["ancestorIds"] = [];

  if (category.parentId) {
    const parent = await CategoryModel.findById(category.parentId).lean();
    if (parent) {
      ancestorIds = [...parent.ancestorIds, parent._id];
    }
  }

  await CategoryModel.updateOne({ _id: categoryId }, { $set: { ancestorIds } });

  const children = await CategoryModel.find({ parentId: categoryId }).select("_id").lean();

  for (const child of children) {
    await rebuildAncestors(String(child._id), depth + 1);
  }
}

/** Refreshes the denormalised product count shown on category tiles. */
export async function refreshProductCount(id: string): Promise<void> {
  const productCount = await ProductModel.countDocuments({
    categoryIds: id,
    status: "ACTIVE",
    ...notDeleted,
  });

  await CategoryModel.updateOne({ _id: id }, { $set: { productCount } });
}
