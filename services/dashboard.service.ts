import { ProductModel } from "@/models/Product";
import { CategoryModel } from "@/models/Category";
import { CollectionModel } from "@/models/Collection";
import { UserModel } from "@/models/User";
import { notDeleted } from "@/models/base";
import { countUnpriced } from "@/repositories/product.repository";

/**
 * Aggregates for the admin Overview screen.
 *
 * Everything here is derived from the catalogue and customer collections,
 * because those are the only ones with data behind them today. There is
 * deliberately **no revenue, order-count or conversion figure**: orders are
 * Phase 4 and have no backend yet, and a dashboard that displays a plausible
 * fabricated number is worse than one that admits the gap — somebody will make
 * a stocking decision on it.
 *
 * Counts run as one `$facet` so the whole panel is a single round trip rather
 * than eight sequential `countDocuments` calls.
 */

export type DashboardStats = {
  catalogue: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    variantCount: number;
  };
  inventory: {
    /** Variants at or below their own `lowStockThreshold`. */
    lowStock: number;
    outOfStock: number;
    unitsOnHand: number;
    unitsReserved: number;
  };
  taxonomy: { categories: number; collections: number };
  customers: { total: number; verified: number; newThisMonth: number };
  pricing: {
    /** Live products with no price. These cannot be bought at all. */
    unpriced: number;
  };
  attention: {
    lowStockProducts: {
      id: string;
      title: string;
      slug: string;
      sku: string;
      available: number;
      threshold: number;
    }[];
    draftProducts: { id: string; title: string; slug: string; updatedAt: Date }[];
  };
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [catalogue, inventory, categories, collections, customers, unpriced, attention] =
    await Promise.all([
      catalogueCounts(),
      inventoryTotals(),
      CategoryModel.countDocuments(notDeleted),
      CollectionModel.countDocuments(notDeleted),
      customerCounts(monthStart),
      countUnpriced(),
      attentionLists(),
    ]);

  return {
    catalogue,
    inventory,
    taxonomy: { categories, collections },
    customers,
    pricing: { unpriced },
    attention,
  };
}

async function catalogueCounts() {
  const [result] = await ProductModel.aggregate([
    { $match: notDeleted },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } },
        draft: { $sum: { $cond: [{ $eq: ["$status", "DRAFT"] }, 1, 0] } },
        archived: { $sum: { $cond: [{ $eq: ["$status", "ARCHIVED"] }, 1, 0] } },
        variantCount: { $sum: { $size: "$variants" } },
      },
    },
  ]);

  return (
    result ?? { total: 0, active: 0, draft: 0, archived: 0, variantCount: 0 }
  );
}

/**
 * Inventory rolled up across every variant.
 *
 * "Low stock" compares available units against each variant's **own**
 * `lowStockThreshold` rather than a global number, because a ₹2 lakh bridal set
 * held one at a time and a ₹900 silver charm held fifty are not low at the same
 * count.
 */
async function inventoryTotals() {
  const [result] = await ProductModel.aggregate([
    { $match: { ...notDeleted, status: { $ne: "ARCHIVED" } } },
    { $unwind: "$variants" },
    { $match: { "variants.isActive": true } },
    {
      $project: {
        available: { $subtract: ["$variants.stock", "$variants.reservedStock"] },
        threshold: "$variants.lowStockThreshold",
        stock: "$variants.stock",
        reserved: "$variants.reservedStock",
      },
    },
    {
      $group: {
        _id: null,
        lowStock: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ["$available", 0] }, { $lte: ["$available", "$threshold"] }] },
              1,
              0,
            ],
          },
        },
        outOfStock: { $sum: { $cond: [{ $lte: ["$available", 0] }, 1, 0] } },
        unitsOnHand: { $sum: "$stock" },
        unitsReserved: { $sum: "$reserved" },
      },
    },
  ]);

  return result ?? { lowStock: 0, outOfStock: 0, unitsOnHand: 0, unitsReserved: 0 };
}

async function customerCounts(monthStart: Date) {
  const [result] = await UserModel.aggregate([
    { $match: { ...notDeleted, role: "customer" } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        verified: { $sum: { $cond: [{ $ifNull: ["$emailVerifiedAt", false] }, 1, 0] } },
        newThisMonth: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart] }, 1, 0] } },
      },
    },
  ]);

  return result ?? { total: 0, verified: 0, newThisMonth: 0 };
}

/** The two "needs your attention" lists the Overview and Inventory screens show. */
async function attentionLists(): Promise<DashboardStats["attention"]> {
  const [lowStock, drafts] = await Promise.all([
    ProductModel.aggregate([
      { $match: { ...notDeleted, status: "ACTIVE" } },
      { $unwind: "$variants" },
      { $match: { "variants.isActive": true } },
      {
        $project: {
          title: 1,
          slug: 1,
          sku: "$variants.sku",
          available: { $subtract: ["$variants.stock", "$variants.reservedStock"] },
          threshold: "$variants.lowStockThreshold",
        },
      },
      { $match: { $expr: { $lte: ["$available", "$threshold"] } } },
      { $sort: { available: 1 } },
      { $limit: 8 },
    ]),
    ProductModel.find({ ...notDeleted, status: "DRAFT" })
      .select("title slug updatedAt")
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
  ]);

  return {
    lowStockProducts: lowStock.map((row) => ({
      id: String(row._id),
      title: row.title,
      slug: row.slug,
      sku: row.sku,
      available: row.available,
      threshold: row.threshold,
    })),
    draftProducts: drafts.map((row) => ({
      id: String(row._id),
      title: row.title,
      slug: row.slug,
      updatedAt: row.updatedAt,
    })),
  };
}
