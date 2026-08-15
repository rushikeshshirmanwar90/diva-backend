import { WishlistModel } from "@/models/Wishlist";

/**
 * Wishlist persistence — one document per customer (see the model for why).
 *
 * `addItem` is two writes, not an upsert with `$push`: an upsert filter using
 * `$ne` on `items.productId` has nothing to derive `items` from when the
 * document does not exist yet, which is exactly the first-ever save for a new
 * customer. Ensuring the (possibly empty) document first keeps the second
 * write a plain, unambiguous update.
 */

export async function getForUser(userId: string) {
  return WishlistModel.findOne({ userId }).lean();
}

async function ensureForUser(userId: string): Promise<void> {
  await WishlistModel.updateOne(
    { userId },
    { $setOnInsert: { userId, items: [] } },
    { upsert: true },
  );
}

/** No-op if the product is already saved — adding twice is not an error. */
export async function addItem(
  userId: string,
  item: { productId: string; priceWhenAddedPaise: number },
): Promise<void> {
  await ensureForUser(userId);

  await WishlistModel.updateOne(
    { userId, "items.productId": { $ne: item.productId } },
    {
      $push: {
        items: {
          productId: item.productId,
          priceWhenAddedPaise: item.priceWhenAddedPaise,
          notifyOnPriceDrop: true,
          addedAt: new Date(),
        },
      },
    },
  );
}

export async function removeItem(userId: string, productId: string): Promise<void> {
  await WishlistModel.updateOne({ userId }, { $pull: { items: { productId } } });
}
