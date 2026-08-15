import { ApiError } from "@/lib/api/errors";
import * as wishlist from "@/repositories/wishlist.repository";
import * as products from "@/repositories/product.repository";

/**
 * Wishlist business logic.
 *
 * The API surface is deliberately thin: a productId and when it was added.
 * Title, image and current price are not joined in here — the storefront
 * already holds the full catalogue client-side (see `catalogue-context.tsx`),
 * so resolving a productId to a product is a local lookup, not a second
 * network round trip.
 */

export async function list(userId: string) {
  const doc = await wishlist.getForUser(userId);

  return (doc?.items ?? [])
    .map((item) => ({ productId: String(item.productId), addedAt: item.addedAt }))
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
}

export async function add(userId: string, productId: string) {
  const product = await products.findById(productId, { publicOnly: true });
  if (!product) throw ApiError.notFound("That product is no longer available.");

  await wishlist.addItem(userId, { productId, priceWhenAddedPaise: product.pricePaise });

  return list(userId);
}

export async function remove(userId: string, productId: string) {
  await wishlist.removeItem(userId, productId);
  return list(userId);
}
