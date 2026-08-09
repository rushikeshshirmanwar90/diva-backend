import mongoose, { type QueryFilter, type PipelineStage } from "mongoose";
import { ProductModel, type ProductDocument } from "@/models/Product";
import { notDeleted } from "@/models/base";
import type { ListProductsQuery } from "@/validators/catalog";

/**
 * Product queries.
 *
 * The listing query is the most performance-sensitive read in the application —
 * it runs on the homepage, every category page and every search — so it is
 * built as a single faceted aggregation rather than several round trips.
 */

export async function findBySlug(slug: string, options: { publicOnly?: boolean } = {}) {
  const filter: QueryFilter<ProductDocument> = { slug, ...notDeleted };
  if (options.publicOnly) filter.status = "ACTIVE";

  return ProductModel.findOne(filter)
    .populate("categoryIds", "name slug")
    .populate("collectionIds", "name slug")
    .lean();
}

export async function findById(id: string, options: { publicOnly?: boolean } = {}) {
  const filter: QueryFilter<ProductDocument> = { _id: id, ...notDeleted };
  if (options.publicOnly) filter.status = "ACTIVE";

  return ProductModel.findOne(filter).lean();
}

export async function slugExists(slug: string, exceptId?: string): Promise<boolean> {
  const filter: QueryFilter<ProductDocument> = { slug };
  if (exceptId) filter._id = { $ne: exceptId };
  return (await ProductModel.countDocuments(filter)) > 0;
}

export async function skuExists(sku: string, exceptId?: string): Promise<boolean> {
  const filter: QueryFilter<ProductDocument> = { "variants.sku": sku.toUpperCase() };
  if (exceptId) filter._id = { $ne: exceptId };
  return (await ProductModel.countDocuments(filter)) > 0;
}

export async function create(input: Partial<ProductDocument>) {
  const product = await ProductModel.create(input);
  return product.toObject();
}

export async function updateById(id: string, update: Partial<ProductDocument>) {
  return ProductModel.findOneAndUpdate({ _id: id, ...notDeleted }, update, { returnDocument: 'after' }).lean();
}

/**
 * Soft delete.
 *
 * Orders reference products; a hard delete orphans order history and a customer
 * opening a past invoice sees a blank line. The row stays, hidden from every
 * catalogue read.
 */
export async function softDelete(id: string) {
  return ProductModel.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), status: "ARCHIVED" } },
    { returnDocument: 'after' },
  ).lean();
}

/**
 * Sets a variant's stock to an absolute value.
 *
 * Absolute rather than a delta because a delta applied twice — a retried
 * request, a double-clicked save — silently drifts the count, and inventory
 * that disagrees with the shelf is discovered only when an order cannot be
 * fulfilled.
 */
export async function setVariantStock(productId: string, variantId: string, stock: number) {
  return ProductModel.findOneAndUpdate(
    { _id: productId, "variants._id": variantId },
    { $set: { "variants.$.stock": stock } },
    { returnDocument: 'after' },
  ).lean();
}

/**
 * Reserves stock for a checkout, atomically.
 *
 * The filter carries the availability condition — `stock - reservedStock >=
 * quantity`, expressed as `$expr` — so the database refuses an over-reservation
 * rather than the application checking first and hoping. Under concurrency,
 * check-then-write oversells: two customers both read "1 in stock" and both
 * proceed to payment, and one of them gets an apology email.
 *
 * Returns null when the reservation could not be made.
 */
export async function reserveStock(productId: string, variantId: string, quantity: number) {
  return ProductModel.findOneAndUpdate(
    {
      _id: productId,
      variants: {
        $elemMatch: {
          _id: new mongoose.Types.ObjectId(variantId),
          isActive: true,
          $expr: { $gte: [{ $subtract: ["$stock", "$reservedStock"] }, quantity] },
        },
      },
    },
    { $inc: { "variants.$.reservedStock": quantity } },
    { returnDocument: 'after' },
  ).lean();
}

/** Releases a reservation when a checkout is abandoned or a payment fails. */
export async function releaseStock(productId: string, variantId: string, quantity: number) {
  return ProductModel.updateOne(
    { _id: productId, "variants._id": variantId },
    { $inc: { "variants.$.reservedStock": -quantity } },
  );
}

/** Converts a reservation into a sale once payment is confirmed. */
export async function commitStock(productId: string, variantId: string, quantity: number) {
  return ProductModel.updateOne(
    { _id: productId, "variants._id": variantId },
    {
      $inc: {
        "variants.$.stock": -quantity,
        "variants.$.reservedStock": -quantity,
        soldCount: quantity,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/**
 * Filtered, sorted, paginated listing **plus** facet counts, in one query.
 *
 * `$facet` runs several sub-pipelines over the same matched set, so the page of
 * results and the "Gold (42) · Silver (17)" filter counts come back together.
 * Computing them separately means N+1 aggregations per page load and counts
 * that can disagree with the results they describe.
 *
 * Note that `$facet` operates on the output of `$match`, so the counts reflect
 * the current filters — which is what a shopper expects: narrowing to "Rings"
 * should update the metal counts.
 */
export async function list(query: ListProductsQuery, options: { publicOnly: boolean }) {
  /**
   * Typed loosely on purpose. This is an aggregation `$match`, not a `find`
   * filter: it addresses dotted paths into array subdocuments
   * (`variants.colour`) that Mongoose's `QueryFilter` does not model, and
   * forcing it through that type would mean a cast on nearly every line below.
   */
  const match: Record<string, unknown> = { ...notDeleted };

  if (options.publicOnly) {
    match.status = "ACTIVE";
  } else if (query.status) {
    match.status = query.status;
  }

  if (query.q) match.$text = { $search: query.q };
  if (query.category?.length) match.categoryIds = { $in: toObjectIds(query.category) };
  if (query.collection?.length) match.collectionIds = { $in: toObjectIds(query.collection) };
  if (query.colour?.length) match["variants.colour"] = { $in: query.colour };
  if (query.gender?.length) match["attributes.gender"] = { $in: query.gender };
  if (query.occasion?.length) match["attributes.occasions"] = { $in: query.occasion };
  if (query.tag?.length) match.tags = { $in: query.tag };
  if (query.featured) match.isFeatured = true;
  if (query.newArrival) match.isNewArrival = true;
  if (query.minRating != null) match.ratingAvg = { $gte: query.minRating };

  if (query.minPrice != null || query.maxPrice != null) {
    // Range against the stored `pricePaise`, which is what the compound index
    // covers. Computing prices per document here would defeat the index.
    match.pricePaise = {
      ...(query.minPrice != null ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice != null ? { $lte: query.maxPrice } : {}),
    };
  }

  if (query.inStock) {
    match.variants = {
      $elemMatch: { isActive: true, $expr: { $gt: [{ $subtract: ["$stock", "$reservedStock"] }, 0] } },
    };
  }

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $facet: {
        items: [
          { $sort: sortStage(query) },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          {
            // Trimmed to what a product card renders. Shipping full descriptions
            // for a 24-item grid is wasted bandwidth on every listing request.
            $project: {
              title: 1,
              slug: 1,
              shortDescription: 1,
              images: { $slice: ["$images", 2] },
              pricePaise: 1,
              compareAtPricePaise: 1,
              ratingAvg: 1,
              ratingCount: 1,
              isFeatured: 1,
              isNewArrival: 1,
              status: 1,
              categoryIds: 1,
              soldCount: 1,
              createdAt: 1,
              variants: {
                $map: {
                  input: "$variants",
                  as: "variant",
                  in: {
                    _id: "$$variant._id",
                    sku: "$$variant.sku",
                    colour: "$variant.colour",
                    size: "$$variant.size",
                    stock: "$$variant.stock",
                    reservedStock: "$$variant.reservedStock",
                    // Carried so the admin inventory screen can flag low stock
                    // against each variant's own threshold rather than a
                    // hard-coded number.
                    lowStockThreshold: "$$variant.lowStockThreshold",
                    isActive: "$$variant.isActive",
                  },
                },
              },
            },
          },
        ],
        total: [{ $count: "count" }],
        facetColours: [
          { $unwind: "$variants" },
          { $group: { _id: "$variants.colour", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        facetCategories: [
          { $unwind: "$categoryIds" },
          { $group: { _id: "$categoryIds", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 30 },
        ],
        priceBounds: [
          {
            $group: {
              _id: null,
              min: { $min: "$pricePaise" },
              max: { $max: "$pricePaise" },
            },
          },
        ],
      },
    },
  ];

  const [result] = await ProductModel.aggregate(pipeline);

  return {
    items: result?.items ?? [],
    total: result?.total?.[0]?.count ?? 0,
    facets: {
      colours: result?.facetColours ?? [],
      categories: result?.facetCategories ?? [],
      priceBounds: result?.priceBounds?.[0] ?? { min: 0, max: 0 },
    },
  };
}

function sortStage(
  query: ListProductsQuery,
): Record<string, 1 | -1 | { $meta: "textScore" }> {
  switch (query.sort) {
    case "relevance":
      // Only meaningful alongside $text; falls back to newest without a query.
      return query.q ? { score: { $meta: "textScore" } } : { createdAt: -1 };
    case "price_asc":
      return { pricePaise: 1 };
    case "price_desc":
      return { pricePaise: -1 };
    case "rating":
      return { ratingAvg: -1, ratingCount: -1 };
    case "popular":
      return { soldCount: -1, viewCount: -1 };
    case "newest":
    default:
      return { createdAt: -1 };
  }
}

function toObjectIds(values: string[]) {
  return values
    .filter((value) => mongoose.isValidObjectId(value))
    .map((value) => new mongoose.Types.ObjectId(value));
}

/**
 * Products related to a given one.
 *
 * Same categories, excluding itself, ordered by rating. Cheap and adequate;
 * a genuine recommender belongs in a later phase and should be measured against
 * this baseline rather than assumed better.
 */
export async function findRelated(
  productId: string,
  categoryIds: mongoose.Types.ObjectId[],
  limit = 8,
) {
  return ProductModel.find({
    _id: { $ne: productId },
    categoryIds: { $in: categoryIds },
    status: "ACTIVE",
    ...notDeleted,
  })
    .select("title slug images pricePaise compareAtPricePaise ratingAvg ratingCount")
    .sort({ ratingAvg: -1, soldCount: -1 })
    .limit(limit)
    .lean();
}

/**
 * Live products with no usable price.
 *
 * Feeds the health check. A product published at ₹0 is refused by the pricing
 * engine, so it sits in the catalogue looking fine and cannot be bought — this
 * is the one query that surfaces it.
 */
export async function countUnpriced() {
  return ProductModel.countDocuments({
    ...notDeleted,
    status: "ACTIVE",
    $or: [{ pricePaise: { $lte: 0 } }, { pricePaise: { $exists: false } }],
  });
}

export async function incrementViewCount(productId: string) {
  await ProductModel.updateOne({ _id: productId }, { $inc: { viewCount: 1 } });
}
