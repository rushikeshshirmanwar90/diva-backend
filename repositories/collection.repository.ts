import { CollectionModel, type CollectionDocument } from "@/models/Collection";
import { ProductModel } from "@/models/Product";
import { notDeleted } from "@/models/base";
import type { QueryFilter } from "mongoose";

export async function findBySlug(slug: string) {
  return CollectionModel.findOne({ slug, ...notDeleted }).lean();
}

export async function findById(id: string) {
  return CollectionModel.findOne({ _id: id, ...notDeleted }).lean();
}

export async function slugExists(slug: string, exceptId?: string): Promise<boolean> {
  const filter: QueryFilter<CollectionDocument> = { slug };
  if (exceptId) filter._id = { $ne: exceptId };
  return (await CollectionModel.countDocuments(filter)) > 0;
}

/**
 * Lists collections.
 *
 * `liveOnly` applies the campaign window in the query rather than filtering in
 * JS afterwards, so pagination stays correct — filtering after a `limit` gives
 * short pages whenever an expired campaign happens to fall in the window.
 */
export async function list(options: {
  includeInactive?: boolean;
  featured?: boolean;
  liveOnly?: boolean;
}) {
  const filter: QueryFilter<CollectionDocument> = { ...notDeleted };

  if (!options.includeInactive) filter.isActive = true;
  if (options.featured) filter.isFeatured = true;

  if (options.liveOnly) {
    const now = new Date();
    filter.$and = [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ];
  }

  return CollectionModel.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
}

export async function create(input: Partial<CollectionDocument>) {
  const collection = await CollectionModel.create(input);
  return collection.toObject();
}

export async function updateById(id: string, update: Partial<CollectionDocument>) {
  return CollectionModel.findOneAndUpdate({ _id: id, ...notDeleted }, update, {
    returnDocument: 'after',
  }).lean();
}

export async function softDelete(id: string) {
  return CollectionModel.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), isActive: false } },
    { returnDocument: 'after' },
  ).lean();
}

/**
 * Keeps `Product.collectionIds` in step with `Collection.productIds`.
 *
 * Membership is stored on both sides: the collection owns the curated,
 * ordered list; the product carries a mirror so filtered listings can use the
 * compound index on `(status, collectionIds, priceFromPaise)`. Querying
 * membership from the collection side instead would mean fetching up to 500 ids
 * and passing them to `$in` on every filtered page.
 *
 * Both writes happen here, in one place, so the mirror cannot drift.
 */
export async function syncProductMembership(
  collectionId: string,
  productIds: string[],
): Promise<void> {
  await ProductModel.updateMany(
    { collectionIds: collectionId, _id: { $nin: productIds } },
    { $pull: { collectionIds: collectionId } },
  );

  if (productIds.length) {
    await ProductModel.updateMany(
      { _id: { $in: productIds } },
      { $addToSet: { collectionIds: collectionId } },
    );
  }
}

/** Called when a product is deleted, so no collection keeps a dangling id. */
export async function removeProductEverywhere(productId: string): Promise<void> {
  await CollectionModel.updateMany(
    { productIds: productId },
    { $pull: { productIds: productId } },
  );
}
