import { ApiError } from "@/lib/api/errors";
import { uniqueSlug } from "@/lib/slug";
import { priceProduct, tryPriceProduct, PricingError } from "@/lib/pricing/engine";
import * as products from "@/repositories/product.repository";
import * as categories from "@/repositories/category.repository";
import * as collections from "@/repositories/collection.repository";
import type { ListProductsQuery } from "@/validators/catalog";
import type { z } from "zod";
import type { createProductSchema, updateProductSchema } from "@/validators/catalog";

/**
 * Product business logic.
 *
 * The load-bearing responsibility here is that **the price charged comes from
 * the database, never from the request**. An admin sets `pricePaise` through
 * the product write path; every customer-facing price — listing, detail, cart,
 * checkout — is that stored value run through the pricing engine for GST. No
 * storefront caller supplies an amount.
 */

type CreateInput = z.infer<typeof createProductSchema>;
type UpdateInput = z.infer<typeof updateProductSchema>;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listProducts(query: ListProductsQuery, options: { isStaff: boolean }) {
  const result = await products.list(query, { publicOnly: !options.isStaff });

  const items = result.items.map((product: Record<string, unknown>) => withStockFlag(product));

  return { items, total: result.total, facets: result.facets };
}

export async function getProductBySlug(slug: string, options: { isStaff: boolean }) {
  const product = await products.findBySlug(slug, { publicOnly: !options.isStaff });

  if (!product) throw ApiError.notFound("We could not find that product.");

  /**
   * One price for the product, and availability per variant.
   *
   * Picking a colour or a size changes what is in stock, never what it costs,
   * so the page shows a single price and each variant carries only its own
   * availability.
   */
  const variants = product.variants.map((variant) => ({
    ...variant,
    available: Math.max(0, variant.stock - variant.reservedStock),
    inStock: variant.isActive && variant.stock - variant.reservedStock > 0,
  }));

  return {
    ...product,
    variants,
    // Null rather than an exception: an unpriced product is still viewable by
    // the staff preview, and the storefront disables its buy button.
    price: tryPriceProduct(product),
    related: await products.findRelated(String(product._id), product.categoryIds ?? []),
  };
}

/**
 * Prices a single variant for the cart.
 *
 * The one function the cart and checkout call. Isolated so there is no path by
 * which a client-supplied amount can reach an order.
 */
export async function priceVariantForCart(productId: string, variantId: string) {
  const product = await products.findById(productId, { publicOnly: true });
  if (!product) throw ApiError.notFound("That product is no longer available.");

  const variant = product.variants.find((candidate) => String(candidate._id) === variantId);
  if (!variant || !variant.isActive) {
    throw ApiError.notFound("That option is no longer available.");
  }

  try {
    return {
      product,
      variant,
      breakdown: priceProduct(product),
      available: Math.max(0, variant.stock - variant.reservedStock),
    };
  } catch (error) {
    if (error instanceof PricingError) {
      throw ApiError.serviceUnavailable(
        "This item cannot be priced right now. Please try again shortly.",
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createProduct(input: CreateInput, actorId: string) {
  await assertCategoriesExist(input.categoryIds);
  await assertSkusAvailable(input.variants.map((variant) => variant.sku));

  const slug = input.slug
    ? await ensureSlugFree(input.slug)
    : await uniqueSlug(input.title, (candidate) => products.slugExists(candidate));

  const created = await products.create({
    ...input,
    slug,
    createdBy: actorId as never,
    publishedAt: input.status === "ACTIVE" ? new Date() : undefined,
  } as never);

  await refreshCategoryCounts(input.categoryIds);

  if (input.collectionIds?.length) {
    await syncCollections(String(created._id), input.collectionIds);
  }

  return getProductBySlug(slug, { isStaff: true });
}

export async function updateProduct(id: string, input: UpdateInput) {
  const existing = await products.findById(id);
  if (!existing) throw ApiError.notFound("We could not find that product.");

  if (input.categoryIds) await assertCategoriesExist(input.categoryIds);

  if (input.variants) {
    await assertSkusAvailable(
      input.variants.map((variant) => variant.sku),
      id,
    );
  }

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    slug = await ensureSlugFree(input.slug, id);
  }

  const update: Record<string, unknown> = { ...input, slug };

  // Stamp the publish date the first time it goes live, and never overwrite it
  // afterwards — it drives "new arrival" ordering and sitemap freshness.
  if (input.status === "ACTIVE" && !existing.publishedAt) {
    update.publishedAt = new Date();
  }

  /**
   * Reservations are preserved across a variant edit.
   *
   * `input.variants` comes from an admin form that has no notion of
   * `reservedStock`, so writing it verbatim would zero out the holds on
   * in-flight checkouts and let the same piece be sold twice.
   */
  if (input.variants) {
    update.variants = input.variants.map((variant) => {
      const previous = existing.variants.find((candidate) => candidate.sku === variant.sku);
      return { ...variant, reservedStock: previous?.reservedStock ?? 0 };
    });
  }

  const updated = await products.updateById(id, update as never);
  if (!updated) throw ApiError.notFound("We could not find that product.");

  const affectedCategories = new Set([
    ...(existing.categoryIds ?? []).map(String),
    ...(input.categoryIds ?? []),
  ]);
  await refreshCategoryCounts([...affectedCategories]);

  if (input.collectionIds) {
    await syncCollections(id, input.collectionIds);
  }

  return getProductBySlug(updated.slug, { isStaff: true });
}

export async function deleteProduct(id: string) {
  const deleted = await products.softDelete(id);
  if (!deleted) throw ApiError.notFound("We could not find that product.");

  await collections.removeProductEverywhere(id);
  await refreshCategoryCounts((deleted.categoryIds ?? []).map(String));

  return { deleted: true };
}

export async function updateStock(productId: string, variantId: string, stock: number) {
  const updated = await products.setVariantStock(productId, variantId, stock);
  if (!updated) throw ApiError.notFound("We could not find that variant.");

  return { productId, variantId, stock };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Adds the one derived field a product card needs.
 *
 * The price itself is not computed here: `pricePaise` is stored on the document
 * and already selected by the listing query, so a card renders it directly.
 */
function withStockFlag(product: Record<string, unknown>) {
  const variants =
    (product.variants as { stock: number; reservedStock: number; isActive: boolean }[]) ?? [];

  return {
    ...product,
    inStock: variants.some(
      (variant) => variant.isActive && variant.stock - variant.reservedStock > 0,
    ),
  };
}

async function ensureSlugFree(slug: string, exceptId?: string): Promise<string> {
  if (await products.slugExists(slug, exceptId)) {
    throw ApiError.conflict(`The slug "${slug}" is already in use.`);
  }
  return slug;
}

async function assertCategoriesExist(categoryIds: string[]): Promise<void> {
  const found = await categories.findManyByIds(categoryIds);

  if (found.length !== categoryIds.length) {
    const foundIds = new Set(found.map((category) => String(category._id)));
    const missing = categoryIds.filter((id) => !foundIds.has(id));
    throw ApiError.badRequest(`Unknown category: ${missing.join(", ")}`);
  }
}

/**
 * Checks SKU uniqueness across the catalogue before writing.
 *
 * The unique index is the real guarantee; this exists so the admin sees
 * "SKU DIVA-RG-001 is already used" instead of a generic conflict from the
 * driver.
 */
async function assertSkusAvailable(skus: string[], exceptId?: string): Promise<void> {
  for (const sku of skus) {
    if (await products.skuExists(sku, exceptId)) {
      throw ApiError.conflict(`SKU "${sku}" is already used by another product.`);
    }
  }
}

async function refreshCategoryCounts(categoryIds: string[]): Promise<void> {
  await Promise.all(categoryIds.map((id) => categories.refreshProductCount(id)));
}

async function syncCollections(productId: string, collectionIds: string[]): Promise<void> {
  for (const collectionId of collectionIds) {
    const collection = await collections.findById(collectionId);
    if (!collection) continue;

    const memberIds = new Set(collection.productIds.map(String));
    memberIds.add(productId);

    await collections.updateById(collectionId, {
      productIds: [...memberIds] as never,
    });
  }
}
