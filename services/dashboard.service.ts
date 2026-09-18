import type { Types } from "mongoose";
import { ProductModel } from "@/models/Product";
import { CategoryModel } from "@/models/Category";
import { CollectionModel } from "@/models/Collection";
import { OrderModel } from "@/models/Order";
import { PaymentModel } from "@/models/Payment";
import { ProductViewModel } from "@/models/ProductView";
import { UserModel } from "@/models/User";
import { notDeleted } from "@/models/base";
import type { OrderStatus, PaymentMethod } from "@/models/enums";
import { PAID_STATUSES } from "@/lib/orders/state-machine";
import { countUnpriced } from "@/repositories/product.repository";

/**
 * Aggregates for the admin Overview screen.
 *
 * Two halves. The catalogue half (products, stock, drafts, customers) is what
 * every staff role can see. The sales half — revenue, orders, the fulfilment
 * pipeline, top sellers — is derived from the orders collection and is only
 * computed for callers holding `order:read`; for anyone else it comes back
 * `null` and the screen simply omits it, rather than 403-ing the whole page.
 *
 * Every rupee figure is integer paise, and "revenue" means **booked** sales:
 * orders in a state where the sale stands (`PAID_STATUSES`). A cancelled or
 * refunded order drops out; a cash-on-delivery order counts from confirmation
 * because the goods are committed then, whether or not the cash has landed.
 * The `codOutstandingPaise` figure exists precisely to show the gap.
 *
 * All day-bucketing is done in `Asia/Kolkata`. The server runs in UTC, and a
 * 1 am order on a Sunday in Bengaluru is a Saturday sale in UTC — a daily
 * chart bucketed by server time would put a third of every evening's orders
 * on the wrong day.
 */

const STORE_TIMEZONE = "Asia/Kolkata";
const WINDOW_DAYS = 30;

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
  /** `null` when the caller may not read orders. */
  sales: SalesStats | null;
  /** Product-page traffic. Catalogue data, so every dashboard reader gets it. */
  traffic: TrafficStats;
};

export type TrafficStats = {
  windowDays: number;
  views: { current: number; previous: number };
  visitors: { current: number; previous: number };
  today: { views: number; visitors: number };
  /** Zero-filled, oldest first, `date` as `YYYY-MM-DD` in store time. */
  daily: { date: string; views: number; visitors: number }[];
  /**
   * Most-viewed products in the window, with what they sold in the same
   * window — the number a merchandiser actually wants is the ratio.
   */
  topViewed: {
    productId: string;
    title: string;
    slug: string;
    imageUrl?: string;
    status: string;
    views: number;
    visitors: number;
    unitsSold: number;
    /** Buyers ÷ visitors, as a percentage with one decimal. */
    conversionPercent: number;
  }[];
  /** Where visitors arrive from, by referring host. Direct/unknown is `null`. */
  sources: { host: string | null; views: number }[];
};

export type SalesStats = {
  /** The rolling window every "current vs previous" figure is measured over. */
  windowDays: number;
  revenue: { currentPaise: number; previousPaise: number };
  orders: { current: number; previous: number };
  averageOrderValue: { currentPaise: number; previousPaise: number };
  today: { revenuePaise: number; orders: number };
  /** One entry per day of the window, oldest first, zero-filled. `date` is `YYYY-MM-DD` in store time. */
  daily: { date: string; revenuePaise: number; orders: number }[];
  byPaymentMethod: Record<PaymentMethod, { orders: number; revenuePaise: number }>;
  /** Live queues — not windowed, because an unshipped order from six weeks ago is still unshipped. */
  pipeline: {
    awaitingPayment: number;
    toShip: number;
    inTransit: number;
    returnsInProgress: number;
  };
  /** Outcomes inside the window. */
  outcomes: {
    delivered: number;
    cancelled: number;
    paymentFailed: number;
    refunded: number;
  };
  topProducts: {
    productId: string;
    title: string;
    slug: string;
    imageUrl?: string;
    units: number;
    revenuePaise: number;
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    itemCount: number;
    grandTotalPaise: number;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    createdAt: Date;
  }[];
  customers: { newInWindow: number; returningInWindow: number };
  money: {
    /** COD orders confirmed or in transit — cash the courier still owes the store. */
    codOutstandingPaise: number;
    codOutstandingOrders: number;
    /** Cancelled or returned orders where money was captured and no refund has gone out. */
    refundsDue: number;
    /** Gateway confirmed a different amount than we charged. Needs a human. */
    amountMismatches: number;
  };
};

export async function getDashboardStats(options: { includeSales: boolean }): Promise<DashboardStats> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [catalogue, inventory, categories, collections, customers, unpriced, attention, sales, traffic] =
    await Promise.all([
      catalogueCounts(),
      inventoryTotals(),
      CategoryModel.countDocuments(notDeleted),
      CollectionModel.countDocuments(notDeleted),
      customerCounts(monthStart),
      countUnpriced(),
      attentionLists(),
      options.includeSales ? salesStats() : Promise.resolve(null),
      trafficStats(),
    ]);

  return {
    catalogue,
    inventory,
    taxonomy: { categories, collections },
    customers,
    pricing: { unpriced },
    attention,
    sales,
    traffic,
  };
}

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

async function trafficStats(): Promise<TrafficStats> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const previousStart = new Date(windowStart.getTime() - WINDOW_DAYS * 86_400_000);

  const [periods, daily, topViewed, sources] = await Promise.all([
    viewPeriodTotals(previousStart, windowStart, now),
    viewDailySeries(windowStart, now),
    topViewedProducts(windowStart),
    referrerSources(windowStart),
  ]);

  const todayKey = storeDateKey(now);
  const today = daily.find((day) => day.date === todayKey) ?? { views: 0, visitors: 0 };

  return {
    windowDays: WINDOW_DAYS,
    views: { current: periods.current.views, previous: periods.previous.views },
    visitors: { current: periods.current.visitors, previous: periods.previous.visitors },
    today: { views: today.views, visitors: today.visitors },
    daily,
    topViewed,
    sources,
  };
}

/**
 * Views and distinct visitors for both periods. Visitors are counted per
 * period, not per bucket, so a person who browsed on ten days is one visitor.
 */
async function viewPeriodTotals(previousStart: Date, windowStart: Date, now: Date) {
  const rows = await ProductViewModel.aggregate<{ _id: string; views: number; visitors: number }>([
    { $match: { viewedAt: { $gte: previousStart, $lte: now } } },
    {
      $group: {
        _id: {
          period: { $cond: [{ $gte: ["$viewedAt", windowStart] }, "current", "previous"] },
          visitor: "$visitorId",
        },
        views: { $sum: 1 },
      },
    },
    { $group: { _id: "$_id.period", views: { $sum: "$views" }, visitors: { $sum: 1 } } },
  ]);

  const byPeriod = new Map(rows.map((row) => [row._id, row]));
  const empty = { views: 0, visitors: 0 };

  return {
    current: byPeriod.get("current") ?? empty,
    previous: byPeriod.get("previous") ?? empty,
  };
}

async function viewDailySeries(windowStart: Date, now: Date) {
  const rows = await ProductViewModel.aggregate<{ _id: string; views: number; visitors: number }>([
    { $match: { viewedAt: { $gte: windowStart, $lte: now } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$viewedAt", timezone: STORE_TIMEZONE } },
          visitor: "$visitorId",
        },
        views: { $sum: 1 },
      },
    },
    { $group: { _id: "$_id.date", views: { $sum: "$views" }, visitors: { $sum: 1 } } },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, row]));
  const series: TrafficStats["daily"] = [];

  for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const date = storeDateKey(new Date(now.getTime() - offset * 86_400_000));
    const row = byDate.get(date);
    series.push({ date, views: row?.views ?? 0, visitors: row?.visitors ?? 0 });
  }

  return series;
}

/**
 * Top products by views, joined to what each sold in the same window.
 *
 * The join is done as a second query over just the eight winning ids rather
 * than a `$lookup` across the whole orders collection — the lookup would scan
 * every order line for every candidate product.
 */
async function topViewedProducts(windowStart: Date): Promise<TrafficStats["topViewed"]> {
  const viewed = await ProductViewModel.aggregate<{
    _id: Types.ObjectId;
    slug: string;
    views: number;
    visitors: number;
  }>([
    { $match: { viewedAt: { $gte: windowStart } } },
    {
      $group: {
        _id: { product: "$productId", visitor: "$visitorId" },
        slug: { $last: "$productSlug" },
        views: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.product",
        slug: { $last: "$slug" },
        views: { $sum: "$views" },
        visitors: { $sum: 1 },
      },
    },
    { $sort: { views: -1, visitors: -1 } },
    { $limit: 8 },
  ]);

  if (viewed.length === 0) return [];

  const ids = viewed.map((row) => row._id);

  const [products, sold] = await Promise.all([
    ProductModel.find({ _id: { $in: ids } })
      .select("title slug status images")
      .lean(),
    OrderModel.aggregate<{ _id: unknown; units: number; buyers: number }>([
      {
        $match: {
          status: { $in: REVENUE_STATUSES },
          createdAt: { $gte: windowStart },
          "items.productId": { $in: ids },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.productId": { $in: ids } } },
      {
        $group: {
          _id: { product: "$items.productId", user: "$userId" },
          units: { $sum: "$items.quantity" },
        },
      },
      { $group: { _id: "$_id.product", units: { $sum: "$units" }, buyers: { $sum: 1 } } },
    ]),
  ]);

  const productById = new Map(products.map((product) => [String(product._id), product]));
  const soldById = new Map(sold.map((row) => [String(row._id), row]));

  return viewed.map((row) => {
    const id = String(row._id);
    const product = productById.get(id);
    const sale = soldById.get(id);
    const buyers = sale?.buyers ?? 0;

    return {
      productId: id,
      title: product?.title ?? row.slug,
      slug: product?.slug ?? row.slug,
      imageUrl: product?.images?.[0]?.url,
      status: product?.status ?? "DELETED",
      views: row.views,
      visitors: row.visitors,
      unitsSold: sale?.units ?? 0,
      conversionPercent: row.visitors === 0 ? 0 : Math.round((buyers / row.visitors) * 1000) / 10,
    };
  });
}

async function referrerSources(windowStart: Date): Promise<TrafficStats["sources"]> {
  const rows = await ProductViewModel.aggregate<{ _id: string | null; views: number }>([
    { $match: { viewedAt: { $gte: windowStart } } },
    { $group: { _id: { $ifNull: ["$referrerHost", null] }, views: { $sum: 1 } } },
    { $sort: { views: -1 } },
    { $limit: 6 },
  ]);

  return rows.map((row) => ({ host: row._id, views: row.views }));
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

/** Orders whose sale stands. Mirrors the state machine so the two cannot drift. */
const REVENUE_STATUSES: readonly OrderStatus[] = PAID_STATUSES;

async function salesStats(): Promise<SalesStats> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const previousStart = new Date(windowStart.getTime() - WINDOW_DAYS * 86_400_000);

  const [periods, daily, byMethod, pipeline, outcomes, topProducts, recentOrders, customers, money] =
    await Promise.all([
      periodTotals(previousStart, windowStart, now),
      dailySeries(windowStart, now),
      paymentMethodSplit(windowStart),
      pipelineCounts(),
      outcomeCounts(windowStart),
      topProductsInWindow(windowStart),
      recentOrderRows(),
      customerMix(windowStart),
      moneyAtRisk(),
    ]);

  const todayKey = storeDateKey(now);
  const today = daily.find((day) => day.date === todayKey) ?? { revenuePaise: 0, orders: 0 };

  return {
    windowDays: WINDOW_DAYS,
    revenue: { currentPaise: periods.current.revenue, previousPaise: periods.previous.revenue },
    orders: { current: periods.current.orders, previous: periods.previous.orders },
    averageOrderValue: {
      currentPaise: averageOf(periods.current.revenue, periods.current.orders),
      previousPaise: averageOf(periods.previous.revenue, periods.previous.orders),
    },
    today: { revenuePaise: today.revenuePaise, orders: today.orders },
    daily,
    byPaymentMethod: byMethod,
    pipeline,
    outcomes,
    topProducts,
    recentOrders,
    customers,
    money,
  };
}

function averageOf(totalPaise: number, count: number): number {
  return count === 0 ? 0 : Math.round(totalPaise / count);
}

/** `YYYY-MM-DD` for a moment, in store time. `en-CA` is the locale whose default format is ISO. */
function storeDateKey(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIMEZONE }).format(at);
}

/**
 * Revenue and order count for the current window and the one before it, in
 * one pass — both come from the same match, so the second period is a
 * conditional sum rather than a second query.
 */
async function periodTotals(previousStart: Date, windowStart: Date, now: Date) {
  const [result] = await OrderModel.aggregate<{
    currentRevenue: number;
    currentOrders: number;
    previousRevenue: number;
    previousOrders: number;
  }>([
    {
      $match: {
        status: { $in: REVENUE_STATUSES },
        createdAt: { $gte: previousStart, $lte: now },
      },
    },
    {
      $group: {
        _id: null,
        currentRevenue: {
          $sum: { $cond: [{ $gte: ["$createdAt", windowStart] }, "$totals.grandTotalPaise", 0] },
        },
        currentOrders: { $sum: { $cond: [{ $gte: ["$createdAt", windowStart] }, 1, 0] } },
        previousRevenue: {
          $sum: { $cond: [{ $lt: ["$createdAt", windowStart] }, "$totals.grandTotalPaise", 0] },
        },
        previousOrders: { $sum: { $cond: [{ $lt: ["$createdAt", windowStart] }, 1, 0] } },
      },
    },
  ]);

  return {
    current: { revenue: result?.currentRevenue ?? 0, orders: result?.currentOrders ?? 0 },
    previous: { revenue: result?.previousRevenue ?? 0, orders: result?.previousOrders ?? 0 },
  };
}

/**
 * Per-day revenue for the window, zero-filled so the chart has a bar for
 * every day. A day with no sales is a data point, not a gap.
 */
async function dailySeries(windowStart: Date, now: Date) {
  const rows = await OrderModel.aggregate<{ _id: string; revenuePaise: number; orders: number }>([
    { $match: { status: { $in: REVENUE_STATUSES }, createdAt: { $gte: windowStart, $lte: now } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: STORE_TIMEZONE } },
        revenuePaise: { $sum: "$totals.grandTotalPaise" },
        orders: { $sum: 1 },
      },
    },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, row]));
  const series: SalesStats["daily"] = [];

  for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const date = storeDateKey(new Date(now.getTime() - offset * 86_400_000));
    const row = byDate.get(date);
    series.push({ date, revenuePaise: row?.revenuePaise ?? 0, orders: row?.orders ?? 0 });
  }

  return series;
}

async function paymentMethodSplit(windowStart: Date): Promise<SalesStats["byPaymentMethod"]> {
  const rows = await OrderModel.aggregate<{ _id: PaymentMethod; orders: number; revenuePaise: number }>([
    { $match: { status: { $in: REVENUE_STATUSES }, createdAt: { $gte: windowStart } } },
    {
      $group: {
        _id: "$paymentMethod",
        orders: { $sum: 1 },
        revenuePaise: { $sum: "$totals.grandTotalPaise" },
      },
    },
  ]);

  const split: SalesStats["byPaymentMethod"] = {
    PHONEPE: { orders: 0, revenuePaise: 0 },
    COD: { orders: 0, revenuePaise: 0 },
    MANUAL: { orders: 0, revenuePaise: 0 },
  };

  for (const row of rows) {
    if (row._id in split) split[row._id] = { orders: row.orders, revenuePaise: row.revenuePaise };
  }

  return split;
}

async function pipelineCounts(): Promise<SalesStats["pipeline"]> {
  const [result] = await OrderModel.aggregate<SalesStats["pipeline"]>([
    {
      $match: {
        status: {
          $in: [
            "PENDING",
            "PAYMENT_INITIATED",
            "CONFIRMED",
            "SHIPMENT_CREATED",
            "SHIPPED",
            "OUT_FOR_DELIVERY",
            "RETURN_REQUESTED",
            "RETURN_PICKED",
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        awaitingPayment: {
          $sum: { $cond: [{ $in: ["$status", ["PENDING", "PAYMENT_INITIATED"]] }, 1, 0] },
        },
        toShip: { $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, 1, 0] } },
        inTransit: {
          $sum: {
            $cond: [{ $in: ["$status", ["SHIPMENT_CREATED", "SHIPPED", "OUT_FOR_DELIVERY"]] }, 1, 0],
          },
        },
        returnsInProgress: {
          $sum: { $cond: [{ $in: ["$status", ["RETURN_REQUESTED", "RETURN_PICKED"]] }, 1, 0] },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return result ?? { awaitingPayment: 0, toShip: 0, inTransit: 0, returnsInProgress: 0 };
}

/**
 * Terminal outcomes, dated by when they *happened* rather than when the order
 * was placed — a cancellation this week of a March order is this week's news.
 */
async function outcomeCounts(windowStart: Date): Promise<SalesStats["outcomes"]> {
  const [delivered, cancelled, paymentFailed, refunded] = await Promise.all([
    OrderModel.countDocuments({ status: "DELIVERED", deliveredAt: { $gte: windowStart } }),
    OrderModel.countDocuments({ status: "CANCELLED", cancelledAt: { $gte: windowStart } }),
    OrderModel.countDocuments({ status: "PAYMENT_FAILED", updatedAt: { $gte: windowStart } }),
    OrderModel.countDocuments({ status: "REFUNDED", updatedAt: { $gte: windowStart } }),
  ]);

  return { delivered, cancelled, paymentFailed, refunded };
}

/**
 * Best sellers by units, from the order snapshots rather than the product's
 * `soldCount`. The snapshot is windowed and survives a product being archived
 * or deleted; `soldCount` is an all-time figure that goes with the product.
 */
async function topProductsInWindow(windowStart: Date): Promise<SalesStats["topProducts"]> {
  const rows = await OrderModel.aggregate<{
    _id: unknown;
    title: string;
    slug: string;
    imageUrl?: string;
    units: number;
    revenuePaise: number;
  }>([
    { $match: { status: { $in: REVENUE_STATUSES }, createdAt: { $gte: windowStart } } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        title: { $last: "$items.title" },
        slug: { $last: "$items.slug" },
        imageUrl: { $last: "$items.imageUrl" },
        units: { $sum: "$items.quantity" },
        revenuePaise: { $sum: "$items.lineTotalPaise" },
      },
    },
    { $sort: { units: -1, revenuePaise: -1 } },
    { $limit: 5 },
  ]);

  return rows.map((row) => ({
    productId: String(row._id),
    title: row.title,
    slug: row.slug,
    imageUrl: row.imageUrl,
    units: row.units,
    revenuePaise: row.revenuePaise,
  }));
}

async function recentOrderRows(): Promise<SalesStats["recentOrders"]> {
  const rows = await OrderModel.find({})
    .select("orderNumber customerEmail shippingAddress.fullName items.quantity totals.grandTotalPaise status paymentMethod createdAt")
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    orderNumber: row.orderNumber,
    customerName: row.shippingAddress?.fullName ?? "",
    customerEmail: row.customerEmail,
    itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
    grandTotalPaise: row.totals.grandTotalPaise,
    status: row.status,
    paymentMethod: row.paymentMethod,
    createdAt: row.createdAt,
  }));
}

/**
 * Of the customers who bought in the window, how many were buying for the
 * first time? Computed from order history rather than account age — an
 * account created last year that placed its first order this week is a new
 * customer in every sense that matters to a retailer.
 */
async function customerMix(windowStart: Date): Promise<SalesStats["customers"]> {
  const [result] = await OrderModel.aggregate<SalesStats["customers"]>([
    { $match: { status: { $in: REVENUE_STATUSES } } },
    {
      $group: {
        _id: "$userId",
        firstOrderAt: { $min: "$createdAt" },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
    { $match: { lastOrderAt: { $gte: windowStart } } },
    {
      $group: {
        _id: null,
        newInWindow: { $sum: { $cond: [{ $gte: ["$firstOrderAt", windowStart] }, 1, 0] } },
        returningInWindow: { $sum: { $cond: [{ $lt: ["$firstOrderAt", windowStart] }, 1, 0] } },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return result ?? { newInWindow: 0, returningInWindow: 0 };
}

async function moneyAtRisk(): Promise<SalesStats["money"]> {
  const [cod, refundsDue, amountMismatches] = await Promise.all([
    OrderModel.aggregate<{ orders: number; paise: number }>([
      {
        $match: {
          paymentMethod: "COD",
          status: { $in: ["CONFIRMED", "SHIPMENT_CREATED", "SHIPPED", "OUT_FOR_DELIVERY"] },
        },
      },
      { $group: { _id: null, orders: { $sum: 1 }, paise: { $sum: "$totals.grandTotalPaise" } } },
    ]),
    // Money was captured (`paidAt` set) and the order has since been cancelled
    // or the goods collected back, but no full refund has moved it to REFUNDED.
    OrderModel.countDocuments({
      status: { $in: ["CANCELLED", "RETURN_PICKED"] },
      paidAt: { $ne: null },
    }),
    PaymentModel.countDocuments({ amountMismatch: true }),
  ]);

  return {
    codOutstandingPaise: cod[0]?.paise ?? 0,
    codOutstandingOrders: cod[0]?.orders ?? 0,
    refundsDue,
    amountMismatches,
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
