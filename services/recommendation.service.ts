import type { Types } from "mongoose";
import { OrderModel } from "@/models/Order";
import { ProductModel } from "@/models/Product";
import { ProductViewModel } from "@/models/ProductView";
import { notDeleted } from "@/models/base";
import { PAID_STATUSES } from "@/lib/orders/state-machine";

/**
 * Behavioural signals for "You may also like".
 *
 * This is the item-to-item collaborative-filtering half of the recommender —
 * the same idea as Amazon's "customers who bought this also bought", scaled to
 * a store where the numbers are hundreds, not millions. Two co-occurrence
 * counts per product:
 *
 *   - **co-purchase**: how many orders contained both this product and the
 *     other. The strongest signal there is; a customer paid for the pair.
 *   - **co-view**: how many *visitors* opened both product pages. Weaker, but
 *     arrives from day one, long before there are enough orders to learn from.
 *
 * Counts are returned raw. Normalisation, weighting against content
 * similarity, and the final ranking happen in the storefront (`diva-frontend`
 * `lib/recommendations/score.ts`), which already holds the full catalogue and
 * can be unit-tested without a database. This service only answers "who goes
 * with whom, and how often".
 *
 * Results are cached in process for a few minutes. Every product page asks
 * for them, and the answer changes only as orders and views accumulate.
 */

export type CoOccurrence = { productId: string; slug: string; count: number };

export type ProductSignals = {
  slug: string;
  /** Orders containing both products, last `PURCHASE_WINDOW_DAYS`. */
  coPurchased: CoOccurrence[];
  /** Distinct visitors who viewed both products, last `VIEW_WINDOW_DAYS`. */
  coViewed: CoOccurrence[];
  /** This product's own volume, so the client can judge how much to trust the above. */
  volume: { orders: number; visitors: number };
};

const PURCHASE_WINDOW_DAYS = 180;
const VIEW_WINDOW_DAYS = 60;
const MAX_NEIGHBOURS = 20;
const CACHE_TTL_MS = 5 * 60_000;

const cache = new Map<string, { at: number; value: ProductSignals }>();

export async function getProductSignals(slug: string): Promise<ProductSignals | null> {
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const product = await ProductModel.findOne({ slug, ...notDeleted }).select("_id slug").lean();
  if (!product) return null;

  const [coPurchased, coViewed, volume] = await Promise.all([
    coPurchasedWith(product._id),
    coViewedWith(product._id),
    ownVolume(product._id),
  ]);

  const value: ProductSignals = { slug: product.slug, coPurchased, coViewed, volume };
  cache.set(slug, { at: Date.now(), value });

  // A bounded cache: the catalogue is ~100 products, but a scan of every slug
  // on the site must not turn this into an unbounded map.
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  return value;
}

export function invalidateSignalsCache(): void {
  cache.clear();
}

/**
 * "Orders that contained X also contained…"
 *
 * Only orders where the sale stood. A pair from a cancelled checkout is not a
 * pair anyone bought.
 */
async function coPurchasedWith(productId: Types.ObjectId): Promise<CoOccurrence[]> {
  const since = new Date(Date.now() - PURCHASE_WINDOW_DAYS * 86_400_000);

  const rows = await OrderModel.aggregate<{ _id: Types.ObjectId; slug: string; count: number }>([
    {
      $match: {
        status: { $in: PAID_STATUSES },
        createdAt: { $gte: since },
        "items.productId": productId,
      },
    },
    { $unwind: "$items" },
    { $match: { "items.productId": { $ne: productId } } },
    // One vote per order, however many units of the other product it held.
    { $group: { _id: { order: "$_id", product: "$items.productId" }, slug: { $last: "$items.slug" } } },
    { $group: { _id: "$_id.product", slug: { $last: "$slug" }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: MAX_NEIGHBOURS },
  ]);

  return rows.map((row) => ({ productId: String(row._id), slug: row.slug, count: row.count }));
}

/**
 * "Visitors who viewed X also viewed…"
 *
 * Counted in distinct visitors, not views, so one person refreshing a pair of
 * pages all afternoon does not manufacture a relationship.
 */
async function coViewedWith(productId: Types.ObjectId): Promise<CoOccurrence[]> {
  const since = new Date(Date.now() - VIEW_WINDOW_DAYS * 86_400_000);

  const viewers = await ProductViewModel.distinct("visitorId", { productId, viewedAt: { $gte: since } });
  if (viewers.length === 0) return [];

  const rows = await ProductViewModel.aggregate<{ _id: Types.ObjectId; slug: string; count: number }>([
    {
      $match: {
        visitorId: { $in: viewers },
        productId: { $ne: productId },
        viewedAt: { $gte: since },
      },
    },
    { $group: { _id: { visitor: "$visitorId", product: "$productId" }, slug: { $last: "$productSlug" } } },
    { $group: { _id: "$_id.product", slug: { $last: "$slug" }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: MAX_NEIGHBOURS },
  ]);

  return rows.map((row) => ({ productId: String(row._id), slug: row.slug, count: row.count }));
}

async function ownVolume(productId: Types.ObjectId): Promise<ProductSignals["volume"]> {
  const purchaseSince = new Date(Date.now() - PURCHASE_WINDOW_DAYS * 86_400_000);
  const viewSince = new Date(Date.now() - VIEW_WINDOW_DAYS * 86_400_000);

  const [orders, visitors] = await Promise.all([
    OrderModel.countDocuments({
      status: { $in: PAID_STATUSES },
      createdAt: { $gte: purchaseSince },
      "items.productId": productId,
    }),
    ProductViewModel.distinct("visitorId", { productId, viewedAt: { $gte: viewSince } }).then(
      (ids) => ids.length,
    ),
  ]);

  return { orders, visitors };
}
