"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Boxes,
  Coins,
  CreditCard,
  Eye,
  Gem,
  Globe,
  IndianRupee,
  MousePointerClick,
  PackageCheck,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Tags,
  Truck,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import {
  api,
  type DashboardStats,
  type SalesStats,
  type TrafficStats,
} from "@/app/admin/_lib/api";
import { dateOnly, money, moneyShort, number, when } from "@/app/admin/_lib/format";
import { orderStatusMeta } from "@/app/admin/_lib/orders";
import {
  ErrorDialog,
  ErrorRow,
  MetricCard,
  MetricGridSkeleton,
  PageHeading,
  ProductMark,
  StatusBadge,
  TableSkeleton,
} from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";

/**
 * The dashboard.
 *
 * Two halves. The top is always visible and is the morning glance: alerts,
 * the four numbers that matter, and the fulfilment queues. Below it one
 * panel switches between the detail views — latest orders, revenue, best
 * sellers, most viewed, restocking — as tabs, so the page stays a single
 * screen rather than a long scroll, and the summary never leaves view while
 * you dig into any one of them.
 *
 * One request feeds everything (`/admin/stats`), so switching tabs is instant
 * and the numbers never disagree between them. The active tab is in the URL
 * (`?tab=viewed`) so a view can be bookmarked or linked from elsewhere.
 *
 * Every comparison is "vs previous 30 days", never "vs last month": a rolling
 * window compares like with like on the 3rd of a month, when a calendar month
 * has three days of data against thirty.
 *
 * Roles without `order:read` get `sales: null` from the API; the sales tabs
 * are not offered and the summary shows catalogue and traffic numbers.
 */

type TabKey = "orders" | "revenue" | "sellers" | "viewed" | "stock";

const TABS: { key: TabKey; label: string; icon: typeof ShoppingBag; needsSales?: boolean }[] = [
  { key: "orders", label: "Latest orders", icon: ShoppingBag, needsSales: true },
  { key: "revenue", label: "Revenue & cash", icon: IndianRupee, needsSales: true },
  { key: "sellers", label: "Best sellers", icon: Receipt, needsSales: true },
  { key: "viewed", label: "Most viewed", icon: Eye },
  { key: "stock", label: "Needs restocking", icon: Boxes },
];

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const requestedTab: TabKey | null = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : null;

  const { data: stats, error, reload } = useAsyncData(
    async () => (await api.get<DashboardStats>("/admin/stats")).data,
    [],
    { errorMessage: "We could not load your dashboard." },
  );

  const errorDialog = useErrorDialog(error, reload);

  if (error) {
    return (
      <>
        <PageHeading eyebrow={dateOnly(new Date())} title="Dashboard" description="Your store at a glance." />
        <ErrorRow message={error} onRetry={reload} />
        <ErrorDialog
          open={errorDialog.open}
          title="Could not load your dashboard"
          message={error}
          retrying={errorDialog.retrying}
          onRetry={errorDialog.retry}
          onClose={errorDialog.close}
        />
      </>
    );
  }

  /**
   * The loading shape mirrors the loaded one — metric cards above a table —
   * rather than a single centred spinner. This is the first screen after
   * signing in, so it is where a layout assembling itself in jumps is most
   * noticeable.
   */
  if (!stats) {
    return (
      <>
        <PageHeading eyebrow={dateOnly(new Date())} title="Dashboard" description="Your store at a glance." />
        <MetricGridSkeleton />
        <section className="panel" style={{ marginTop: 18 }}>
          <TableSkeleton
            columns={5}
            headers={["Order", "Customer", "Items", "Total", "Status"]}
            rows={5}
            label="Loading your dashboard…"
            trailingActions={false}
          />
        </section>
      </>
    );
  }

  const sales = stats.sales;
  const tabs = TABS.filter((t) => !t.needsSales || sales);
  const tab: TabKey =
    requestedTab && tabs.some((t) => t.key === requestedTab) ? requestedTab : tabs[0]!.key;

  const selectTab = (next: TabKey) =>
    router.replace(next === tabs[0]!.key ? "/admin" : `/admin?tab=${next}`, { scroll: false });

  return (
    <>
      <PageHeading
        eyebrow={dateOnly(new Date())}
        title={sales ? "Your store today" : "Your catalogue today"}
        description={
          sales
            ? `${sales.today.orders === 0 ? "No orders yet today" : `${number(sales.today.orders)} ${sales.today.orders === 1 ? "order" : "orders"} today`} · ${moneyShort(sales.today.revenuePaise)} booked · ${number(stats.traffic.today.views)} product ${stats.traffic.today.views === 1 ? "view" : "views"}`
            : "Everything your storefront is currently able to sell."
        }
        action="Add product"
        actionHref="/admin/products/new"
      />

      {/* Always visible: what needs doing, the headline numbers, the queues. */}
      <Alerts stats={stats} />
      <OverviewMetrics stats={stats} onSelectTab={selectTab} />
      {sales && <Pipeline sales={sales} />}

      {/* One panel, many views. */}
      <section className="panel dash-panel">
        <nav className="dash-tabs" aria-label="Dashboard views">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`dash-tab${tab === key ? " is-active" : ""}`}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => selectTab(key)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>

        <div className="dash-panel-body">
          {tab === "orders" && sales && <RecentOrders sales={sales} />}

          {tab === "revenue" && sales && (
            <>
              <SalesMetrics sales={sales} />
              <div className="overview-grid" style={{ marginBottom: 0 }}>
                <RevenueChart sales={sales} />
                <MoneyPanel sales={sales} />
              </div>
            </>
          )}

          {tab === "sellers" && sales && (
            <div className="overview-grid" style={{ marginBottom: 0 }}>
              <TopProducts sales={sales} />
              <PaymentMix sales={sales} />
            </div>
          )}

          {tab === "viewed" && (
            <>
              <TrafficMetrics traffic={stats.traffic} sales={sales} />
              <div className="overview-grid" style={{ marginBottom: 0 }}>
                <TopViewed traffic={stats.traffic} />
                <TrafficPanel traffic={stats.traffic} />
              </div>
            </>
          )}

          {tab === "stock" && (
            <>
              <CatalogueMetrics stats={stats} />
              <div className="overview-grid" style={{ marginBottom: 0 }}>
                <Restocking stats={stats} />
                <CataloguePanel stats={stats} />
              </div>
              <Drafts stats={stats} />
            </>
          )}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/**
 * Four numbers, one from each concern, each a shortcut into its tab. This is
 * the row an owner reads over coffee; everything else is a click away.
 */
function OverviewMetrics({ stats, onSelectTab }: { stats: DashboardStats; onSelectTab: (tab: TabKey) => void }) {
  const sales = stats.sales;
  const traffic = stats.traffic;
  const stockAttention = stats.inventory.lowStock + stats.inventory.outOfStock + stats.pricing.unpriced;
  const revenue = sales ? delta(sales.revenue.currentPaise, sales.revenue.previousPaise) : null;
  const orders = sales ? delta(sales.orders.current, sales.orders.previous) : null;
  const views = delta(traffic.views.current, traffic.views.previous);
  const label = `vs previous ${traffic.windowDays} days`;

  return (
    <section className="metric-grid">
      {sales ? (
        <>
          <button type="button" className="metric-link" onClick={() => onSelectTab("revenue")}>
            <MetricCard
              label={`Revenue · ${sales.windowDays} days`}
              value={moneyShort(sales.revenue.currentPaise)}
              icon={IndianRupee}
              delta={revenue?.text}
              direction={revenue?.direction}
              deltaLabel={label}
              footnote={revenue ? undefined : `${moneyShort(sales.today.revenuePaise)} booked today`}
            />
          </button>
          <button type="button" className="metric-link" onClick={() => onSelectTab("orders")}>
            <MetricCard
              label="Orders"
              value={number(sales.orders.current)}
              icon={ShoppingBag}
              delta={orders?.text}
              direction={orders?.direction}
              deltaLabel={label}
              footnote={
                orders
                  ? undefined
                  : sales.pipeline.toShip > 0
                    ? `${number(sales.pipeline.toShip)} waiting to ship`
                    : "Nothing waiting to ship"
              }
            />
          </button>
        </>
      ) : (
        <>
          <button type="button" className="metric-link" onClick={() => onSelectTab("stock")}>
            <MetricCard
              label="Live products"
              value={number(stats.catalogue.active)}
              icon={Gem}
              footnote={`${number(stats.catalogue.variantCount)} variants · ${number(stats.catalogue.draft)} drafts`}
            />
          </button>
          <button type="button" className="metric-link" onClick={() => onSelectTab("stock")}>
            <MetricCard
              label="Units on hand"
              value={number(stats.inventory.unitsOnHand)}
              icon={Boxes}
              footnote={
                stats.inventory.unitsReserved > 0
                  ? `${number(stats.inventory.unitsReserved)} reserved by open checkouts`
                  : "Nothing reserved"
              }
            />
          </button>
        </>
      )}
      <button type="button" className="metric-link" onClick={() => onSelectTab("viewed")}>
        <MetricCard
          label={`Product views · ${traffic.windowDays} days`}
          value={number(traffic.views.current)}
          icon={Eye}
          delta={views?.text}
          direction={views?.direction}
          deltaLabel={label}
          footnote={views ? undefined : `${number(traffic.visitors.current)} unique visitors`}
        />
      </button>
      <button type="button" className="metric-link" onClick={() => onSelectTab("stock")}>
        <MetricCard
          label="Stock attention"
          value={number(stockAttention)}
          icon={PackageCheck}
          footnote={`${number(stats.inventory.lowStock)} low · ${number(stats.inventory.outOfStock)} out · ${number(stats.pricing.unpriced)} unpriced`}
        />
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/**
 * Things that are wrong right now, above everything else.
 *
 * Only ever rendered when there is something to say — an "all clear" banner
 * on every load trains people to stop reading the banner.
 */
function Alerts({ stats }: { stats: DashboardStats }) {
  const sales = stats.sales;
  const items: { key: string; title: string; body: string; href?: string; cta?: string }[] = [];

  if (sales && sales.money.amountMismatches > 0) {
    items.push({
      key: "mismatch",
      title: `${number(sales.money.amountMismatches)} ${sales.money.amountMismatches === 1 ? "payment" : "payments"} charged a different amount than the order total`,
      body: "Fulfilment is held on these until someone reviews them. Nothing has shipped.",
      href: "/admin/orders?status=PAYMENT_SUCCESS",
      cta: "Review",
    });
  }

  if (sales && sales.money.refundsDue > 0) {
    items.push({
      key: "refunds",
      title: `${number(sales.money.refundsDue)} ${sales.money.refundsDue === 1 ? "refund is" : "refunds are"} owed to customers`,
      body: "Cancelled or returned orders where the payment was captured and not yet refunded.",
      href: "/admin/orders?status=CANCELLED",
      cta: "See orders",
    });
  }

  if (stats.pricing.unpriced > 0) {
    items.push({
      key: "unpriced",
      title: `${number(stats.pricing.unpriced)} published ${stats.pricing.unpriced === 1 ? "product has" : "products have"} no price`,
      body: `${stats.pricing.unpriced === 1 ? "It is" : "They are"} visible in the storefront but cannot be added to a bag until a price is set.`,
      href: "/admin/products",
      cta: "Set a price",
    });
  }

  if (items.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
      {items.map((item) => (
        <div className="rate-warning" key={item.key} style={{ marginBottom: 0 }}>
          <div className="alert-icon">
            <AlertTriangle />
          </div>
          <div>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </div>
          {item.href && (
            <Link href={item.href} className="text-button" style={{ marginLeft: "auto" }}>
              {item.cta} <ArrowUpRight />
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

/**
 * "+12.4%" against the previous window, or nothing when there is no prior
 * period to compare against — a delta from zero is infinite and reads as a
 * bug, and a delta *to* zero is better said in words.
 */
function delta(current: number, previous: number): { text: string; direction: "up" | "down" } | null {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (!Number.isFinite(change)) return null;
  const rounded = Math.round(change * 10) / 10;
  return {
    text: `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-IN")}%`,
    direction: rounded < 0 ? "down" : "up",
  };
}

function SalesMetrics({ sales }: { sales: SalesStats }) {
  const label = `vs previous ${sales.windowDays} days`;
  const revenue = delta(sales.revenue.currentPaise, sales.revenue.previousPaise);
  const orders = delta(sales.orders.current, sales.orders.previous);
  const aov = delta(sales.averageOrderValue.currentPaise, sales.averageOrderValue.previousPaise);
  const buyers = sales.customers.newInWindow + sales.customers.returningInWindow;
  const returningShare = buyers === 0 ? 0 : Math.round((sales.customers.returningInWindow / buyers) * 100);

  return (
    <section className="metric-grid">
      <MetricCard
        label={`Revenue · ${sales.windowDays} days`}
        value={moneyShort(sales.revenue.currentPaise)}
        icon={IndianRupee}
        delta={revenue?.text}
        direction={revenue?.direction}
        deltaLabel={label}
        footnote={
          sales.revenue.previousPaise === 0
            ? "No sales in the previous period to compare"
            : undefined
        }
      />
      <MetricCard
        label="Orders"
        value={number(sales.orders.current)}
        icon={ShoppingBag}
        delta={orders?.text}
        direction={orders?.direction}
        deltaLabel={label}
        footnote={
          sales.orders.previous === 0
            ? `${number(sales.outcomes.delivered)} delivered · ${number(sales.outcomes.cancelled)} cancelled`
            : undefined
        }
      />
      <MetricCard
        label="Average order"
        value={moneyShort(sales.averageOrderValue.currentPaise)}
        icon={Receipt}
        delta={aov?.text}
        direction={aov?.direction}
        deltaLabel={label}
        footnote={sales.orders.current === 0 ? "No orders in this period" : undefined}
      />
      <MetricCard
        label="Customers who bought"
        value={number(buyers)}
        icon={Users}
        footnote={
          buyers === 0
            ? "Nobody has ordered in this period"
            : `${number(sales.customers.newInWindow)} new · ${number(sales.customers.returningInWindow)} returning (${returningShare}%)`
        }
      />
    </section>
  );
}

/** The four live queues. Not windowed — old unshipped orders are still unshipped. */
function Pipeline({ sales }: { sales: SalesStats }) {
  const tiles = [
    {
      key: "toShip",
      href: "/admin/orders?status=CONFIRMED",
      label: "To ship",
      value: sales.pipeline.toShip,
      icon: PackageCheck,
      tone: "activity-amber",
      hot: sales.pipeline.toShip > 0,
      hint: "Paid and waiting for a label",
    },
    {
      key: "inTransit",
      href: "/admin/orders?status=SHIPPED",
      label: "In transit",
      value: sales.pipeline.inTransit,
      icon: Truck,
      tone: "activity-violet",
      hot: false,
      hint: "With the courier",
    },
    {
      key: "returns",
      href: "/admin/orders?status=RETURN_REQUESTED",
      label: "Returns in progress",
      value: sales.pipeline.returnsInProgress,
      icon: Undo2,
      tone: "activity-rose",
      hot: sales.pipeline.returnsInProgress > 0,
      hint: "Requested or picked up",
    },
    {
      key: "awaiting",
      href: "/admin/orders?status=PENDING",
      label: "Awaiting payment",
      value: sales.pipeline.awaitingPayment,
      icon: Wallet,
      tone: "activity-slate",
      hot: false,
      hint: "Open checkouts holding stock",
    },
  ];

  return (
    <section className="pipeline-grid" aria-label="Fulfilment pipeline">
      {tiles.map(({ key, href, label, value, icon: Icon, tone, hot, hint }) => (
        <Link className={`pipeline-tile${hot ? " is-hot" : ""}`} key={key} href={href}>
          <div className={`activity-icon ${tone}`}>
            <Icon />
          </div>
          <div style={{ minWidth: 0 }}>
            <strong>{number(value)}</strong>
            <span>
              {label} · {hint}
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}

/**
 * Thirty bars, one per day, revenue on the y-axis.
 *
 * Plain divs against the existing `.sales-chart` styles rather than a charting
 * library: thirty numbers do not justify 200KB of dependency, and the CSS was
 * already there. Each bar carries its day and amount as a `title`, which is
 * the whole of the interactivity a glance-and-go chart needs.
 */
function RevenueChart({ sales }: { sales: SalesStats }) {
  const peak = Math.max(...sales.daily.map((day) => day.revenuePaise), 0);
  const hasData = peak > 0;

  // Four gridlines that land on round rupee amounts rather than peak/4.
  const step = niceStep(peak / 4);
  const top = hasData ? Math.max(step * 4, step * Math.ceil(peak / step)) : 4;
  const ticks = [4, 3, 2, 1, 0].map((n) => (top / 4) * n);

  const first = sales.daily[0];
  const middle = sales.daily[Math.floor(sales.daily.length / 2)];
  const last = sales.daily[sales.daily.length - 1];
  const bestDay = sales.daily.reduce((best, day) => (day.revenuePaise > best.revenuePaise ? day : best), sales.daily[0]!);

  return (
    <article className="panel sales-panel">
      <div className="panel-heading">
        <div>
          <h2>Revenue</h2>
          <p>Booked sales per day, last {sales.windowDays} days</p>
        </div>
        <div className="chart-legend" style={{ paddingTop: 0 }}>
          <span>
            <i className="legend-dot legend-primary" /> Revenue
          </span>
        </div>
      </div>

      <div className="chart-summary">
        <div>
          <strong>{moneyShort(sales.today.revenuePaise)}</strong>
          <span>Today</span>
        </div>
        <div>
          <strong>{moneyShort(sales.revenue.currentPaise)}</strong>
          <span>Last {sales.windowDays} days</span>
        </div>
        {hasData && (
          <div>
            <strong>{moneyShort(bestDay.revenuePaise)}</strong>
            <span>Best day · {shortDate(bestDay.date)}</span>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="state-row" style={{ marginTop: 16 }}>
          No booked sales in the last {sales.windowDays} days. The chart appears with the first order.
        </div>
      ) : (
        <div className="sales-chart">
          <div className="chart-y-axis">
            {ticks.map((tick) => (
              <span key={tick}>{axisLabel(tick)}</span>
            ))}
          </div>
          <div className="chart-area">
            <div className="chart-gridlines" aria-hidden="true">
              {ticks.map((tick) => (
                <i key={tick} />
              ))}
            </div>
            <div className="chart-bars" role="img" aria-label={`Daily revenue for the last ${sales.windowDays} days`}>
              {sales.daily.map((day) => (
                <div
                  key={day.date}
                  className={`chart-bar ${day.revenuePaise > 0 ? "chart-bar-main" : "chart-bar-empty"}`}
                  style={{ height: `${Math.max(2, (day.revenuePaise / top) * 100)}%` }}
                  title={`${longDate(day.date)} · ${money(day.revenuePaise)} · ${day.orders} ${day.orders === 1 ? "order" : "orders"}`}
                />
              ))}
            </div>
            <div className="chart-x-axis" aria-hidden="true">
              <span>{first ? shortDate(first.date) : ""}</span>
              <span>{middle ? shortDate(middle.date) : ""}</span>
              <span>{last ? "Today" : ""}</span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/** Rounds a rupee step up to 1, 2, 5 × 10ⁿ so gridlines read as ₹5,000 not ₹4,812. */
function niceStep(paise: number): number {
  if (paise <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(paise));
  const fraction = paise / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** ₹1.2L / ₹45K / ₹800 — axis labels have no room for lakh separators. */
function axisLabel(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 10_000_000) return `₹${trim(rupees / 10_000_000)}Cr`;
  if (rupees >= 100_000) return `₹${trim(rupees / 100_000)}L`;
  if (rupees >= 1_000) return `₹${trim(rupees / 1_000)}K`;
  return `₹${Math.round(rupees)}`;
}

function trim(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** Money that is booked but not yet in the bank, or owed back out of it. */
function MoneyPanel({ sales }: { sales: SalesStats }) {
  return (
    <article className="panel activity-panel">
      <div className="panel-heading">
        <div>
          <h2>Cash position</h2>
          <p>What is still moving</p>
        </div>
      </div>

      <div className="activity-list">
        <div className="activity-row">
          <div className="activity-icon activity-violet">
            <Banknote />
          </div>
          <div>
            <strong>{moneyShort(sales.money.codOutstandingPaise)} to collect on delivery</strong>
            <span>
              {sales.money.codOutstandingOrders === 0
                ? "No cash-on-delivery orders in flight"
                : `${number(sales.money.codOutstandingOrders)} COD ${sales.money.codOutstandingOrders === 1 ? "order" : "orders"} confirmed or in transit`}
            </span>
          </div>
        </div>

        <div className="activity-row">
          <div className={`activity-icon ${sales.money.refundsDue > 0 ? "activity-rose" : "activity-green"}`}>
            <RotateCcw />
          </div>
          <div>
            <strong>
              {sales.money.refundsDue === 0
                ? "No refunds outstanding"
                : `${number(sales.money.refundsDue)} ${sales.money.refundsDue === 1 ? "refund" : "refunds"} to issue`}
            </strong>
            <span>Captured payments on cancelled or returned orders</span>
          </div>
        </div>

        <div className="activity-row">
          <div className={`activity-icon ${sales.money.amountMismatches > 0 ? "activity-rose" : "activity-green"}`}>
            <AlertTriangle />
          </div>
          <div>
            <strong>
              {sales.money.amountMismatches === 0
                ? "Every payment reconciled"
                : `${number(sales.money.amountMismatches)} amount ${sales.money.amountMismatches === 1 ? "mismatch" : "mismatches"}`}
            </strong>
            <span>Gateway total vs order total, checked on every payment</span>
          </div>
        </div>

        <div className="activity-row">
          <div className="activity-icon activity-slate">
            <CreditCard />
          </div>
          <div>
            <strong>
              {number(sales.outcomes.paymentFailed)} failed {sales.outcomes.paymentFailed === 1 ? "payment" : "payments"}
            </strong>
            <span>
              {number(sales.outcomes.cancelled)} cancelled · {number(sales.outcomes.refunded)} refunded in the last{" "}
              {sales.windowDays} days
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function RecentOrders({ sales, limit }: { sales: SalesStats; limit?: number }) {
  const rows = limit ? sales.recentOrders.slice(0, limit) : sales.recentOrders;
  return (
    <section className="orders-panel dash-flat">
      <div className="panel-heading">
        <div>
          <h2>Latest orders</h2>
          <p>The most recent {rows.length || ""} orders, newest first</p>
        </div>
        <Link href="/admin/orders" className="text-button">
          All orders <ArrowUpRight />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="state-row">No orders yet. The first one will appear here the moment it is placed.</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const badge = orderStatusMeta(order.status);
                return (
                  <tr key={order.id}>
                    <td>
                      <div className="table-product">
                        <div>
                          <Link href={`/admin/orders/${order.orderNumber}`} style={{ color: "inherit", textDecoration: "none" }}>
                            <strong>{order.orderNumber}</strong>
                          </Link>
                          <span>{when(order.createdAt)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="table-product">
                        <div>
                          <strong>{order.customerName || "—"}</strong>
                          <span>{order.customerEmail}</span>
                        </div>
                      </div>
                    </td>
                    <td>{number(order.itemCount)}</td>
                    <td>
                      <span className={`method-pill${order.paymentMethod === "COD" ? " is-cod" : ""}`}>
                        {order.paymentMethod === "COD" ? "COD" : order.paymentMethod === "PHONEPE" ? "PhonePe" : "Manual"}
                      </span>
                    </td>
                    <td className="table-strong">{money(order.grandTotalPaise)}</td>
                    <td>
                      <StatusBadge label={badge.label} tone={badge.tone} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TopProducts({ sales }: { sales: SalesStats }) {
  return (
    <article className="panel sales-panel">
      <div className="panel-heading">
        <div>
          <h2>Best sellers</h2>
          <p>By units sold in the last {sales.windowDays} days</p>
        </div>
        <Link href="/admin/products" className="text-button">
          All products <ArrowUpRight />
        </Link>
      </div>

      {sales.topProducts.length === 0 ? (
        <div className="state-row" style={{ marginTop: 16 }}>Nothing sold in this period yet.</div>
      ) : (
        <div className="rank-list">
          {sales.topProducts.map((product, index) => (
            <div className="rank-row" key={product.productId}>
              <span className="rank">{index + 1}</span>
              <ProductMark label={product.title} keySeed={product.slug} imageUrl={product.imageUrl} />
              <div className="rank-main">
                <Link href={`/admin/products/${product.productId}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <strong>{product.title}</strong>
                </Link>
                <span>
                  {number(product.units)} {product.units === 1 ? "unit" : "units"}
                </span>
              </div>
              <span className="rank-value">{moneyShort(product.revenuePaise)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function PaymentMix({ sales }: { sales: SalesStats }) {
  const methods = [
    { key: "PHONEPE", label: "PhonePe", className: "split-phonepe", ...sales.byPaymentMethod.PHONEPE },
    { key: "COD", label: "Cash on delivery", className: "split-cod", ...sales.byPaymentMethod.COD },
    { key: "MANUAL", label: "Manual", className: "split-manual", ...sales.byPaymentMethod.MANUAL },
  ].filter((method) => method.key !== "MANUAL" || method.orders > 0);

  const total = methods.reduce((sum, method) => sum + method.revenuePaise, 0);

  return (
    <article className="panel activity-panel">
      <div className="panel-heading">
        <div>
          <h2>How customers paid</h2>
          <p>Share of revenue, last {sales.windowDays} days</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="state-row" style={{ marginTop: 16 }}>No paid orders in this period.</div>
      ) : (
        <>
          <div className="split-bar" aria-hidden="true">
            {methods.map((method) => (
              <i
                key={method.key}
                className={method.className}
                style={{ width: `${(method.revenuePaise / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="split-legend">
            {methods.map((method) => (
              <span key={method.key}>
                <i className={`legend-dot ${method.className}`} />
                <b>{method.label}</b> {Math.round((method.revenuePaise / total) * 100)}% ·{" "}
                {number(method.orders)} {method.orders === 1 ? "order" : "orders"}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="activity-list">
        <div className="activity-row">
          <div className="activity-icon activity-green">
            <PackageCheck />
          </div>
          <div>
            <strong>{number(sales.outcomes.delivered)} delivered</strong>
            <span>In the last {sales.windowDays} days</span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

function TrafficMetrics({ traffic, sales }: { traffic: TrafficStats; sales: SalesStats | null }) {
  const label = `vs previous ${traffic.windowDays} days`;
  const views = delta(traffic.views.current, traffic.views.previous);
  const visitors = delta(traffic.visitors.current, traffic.visitors.previous);

  /**
   * Orders ÷ visitors. Both are window totals, so a visitor who came on three
   * days and bought once counts as one visitor and one order. Only meaningful
   * once there are visitors to divide by, and only shown to roles that may
   * see order counts at all.
   */
  const conversion =
    sales && traffic.visitors.current > 0
      ? Math.round((sales.orders.current / traffic.visitors.current) * 1000) / 10
      : null;
  const previousConversion =
    sales && traffic.visitors.previous > 0
      ? (sales.orders.previous / traffic.visitors.previous) * 100
      : null;
  const conversionDelta =
    conversion != null && previousConversion != null && previousConversion > 0
      ? delta(conversion, previousConversion)
      : null;

  const viewsPerVisitor =
    traffic.visitors.current > 0
      ? Math.round((traffic.views.current / traffic.visitors.current) * 10) / 10
      : 0;

  return (
    <section className="metric-grid">
      <MetricCard
        label={`Product views · ${traffic.windowDays} days`}
        value={number(traffic.views.current)}
        icon={Eye}
        delta={views?.text}
        direction={views?.direction}
        deltaLabel={label}
        footnote={
          traffic.views.previous === 0
            ? traffic.views.current === 0
              ? "Views appear as customers open product pages"
              : "No views in the previous period to compare"
            : undefined
        }
      />
      <MetricCard
        label="Unique visitors"
        value={number(traffic.visitors.current)}
        icon={Users}
        delta={visitors?.text}
        direction={visitors?.direction}
        deltaLabel={label}
        footnote={
          traffic.visitors.previous === 0
            ? viewsPerVisitor > 0
              ? `${viewsPerVisitor} products viewed per visitor`
              : "Nobody has viewed a product yet"
            : undefined
        }
      />
      <MetricCard
        label="Visitor → order"
        value={conversion == null ? "—" : `${conversion.toLocaleString("en-IN")}%`}
        icon={MousePointerClick}
        delta={conversionDelta?.text}
        direction={conversionDelta?.direction}
        deltaLabel={label}
        footnote={
          conversion == null
            ? sales
              ? "Needs visitors to measure"
              : "Requires order access"
            : conversionDelta
              ? undefined
              : `${number(sales?.orders.current ?? 0)} orders from ${number(traffic.visitors.current)} visitors`
        }
      />
      <MetricCard
        label="Today"
        value={number(traffic.today.views)}
        icon={Eye}
        footnote={
          traffic.today.views === 0
            ? "No product views yet today"
            : `${number(traffic.today.views)} ${traffic.today.views === 1 ? "view" : "views"} from ${number(traffic.today.visitors)} ${traffic.today.visitors === 1 ? "visitor" : "visitors"}`
        }
      />
    </section>
  );
}

/**
 * Most-viewed products with their sales in the same window.
 *
 * The interesting rows are the ones people keep opening and never buy — a
 * price, a photo or a stock problem, every time. Those get a "No sales" badge
 * so they stand out without a separate list.
 */
function TopViewed({ traffic }: { traffic: TrafficStats }) {
  return (
    <article className="panel sales-panel">
      <div className="panel-heading">
        <div>
          <h2>Most viewed products</h2>
          <p>Views, visitors and what each sold in the last {traffic.windowDays} days</p>
        </div>
        <Link href="/admin/products" className="text-button">
          All products <ArrowUpRight />
        </Link>
      </div>

      {traffic.topViewed.length === 0 ? (
        <div className="state-row" style={{ marginTop: 16 }}>
          No product views recorded yet. They appear as soon as customers open product pages on the storefront.
        </div>
      ) : (
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Views</th>
                <th>Visitors</th>
                <th>Sold</th>
                <th>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {traffic.topViewed.map((product) => {
                const coldSeller = product.visitors >= 10 && product.unitsSold === 0;
                return (
                  <tr key={product.productId}>
                    <td>
                      <div className="table-product">
                        <ProductMark label={product.title} keySeed={product.slug} imageUrl={product.imageUrl} />
                        <div>
                          <strong>
                            {product.status === "DELETED" ? (
                              product.title
                            ) : (
                              <Link
                                href={`/admin/products/${product.productId}`}
                                style={{ color: "inherit", textDecoration: "none" }}
                              >
                                {product.title}
                              </Link>
                            )}
                          </strong>
                          <span>
                            {product.slug}
                            {product.status !== "ACTIVE" && ` · ${product.status.toLowerCase()}`}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="table-strong">{number(product.views)}</td>
                    <td>{number(product.visitors)}</td>
                    <td>{number(product.unitsSold)}</td>
                    <td>
                      {coldSeller ? (
                        <StatusBadge label="No sales" tone="low" />
                      ) : product.unitsSold > 0 ? (
                        <StatusBadge label={`${product.conversionPercent.toLocaleString("en-IN")}%`} tone="stock" />
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

/** A 30-day views chart with the referrer breakdown beneath it. */
function TrafficPanel({ traffic }: { traffic: TrafficStats }) {
  const peak = Math.max(...traffic.daily.map((day) => day.views), 0);
  const hasData = peak > 0;
  const step = niceStep(peak / 4);
  const top = hasData ? Math.max(step * 4, step * Math.ceil(peak / step)) : 4;
  const ticks = [4, 3, 2, 1, 0].map((n) => (top / 4) * n);
  const first = traffic.daily[0];
  const last = traffic.daily[traffic.daily.length - 1];
  const totalSourced = traffic.sources.reduce((sum, source) => sum + source.views, 0);

  return (
    <article className="panel activity-panel">
      <div className="panel-heading">
        <div>
          <h2>Views per day</h2>
          <p>Last {traffic.windowDays} days</p>
        </div>
      </div>

      {!hasData ? (
        <div className="state-row" style={{ marginTop: 16 }}>Nothing to chart yet.</div>
      ) : (
        <div className="sales-chart" style={{ height: 150 }}>
          <div className="chart-y-axis">
            {ticks.map((tick) => (
              <span key={tick}>{number(Math.round(tick))}</span>
            ))}
          </div>
          <div className="chart-area">
            <div className="chart-gridlines" aria-hidden="true">
              {ticks.map((tick) => (
                <i key={tick} />
              ))}
            </div>
            <div className="chart-bars" role="img" aria-label={`Daily product views for the last ${traffic.windowDays} days`}>
              {traffic.daily.map((day) => (
                <div
                  key={day.date}
                  className={`chart-bar ${day.views > 0 ? "chart-bar-violet" : "chart-bar-empty"}`}
                  style={{ height: `${Math.max(2, (day.views / top) * 100)}%` }}
                  title={`${longDate(day.date)} · ${number(day.views)} ${day.views === 1 ? "view" : "views"} · ${number(day.visitors)} ${day.visitors === 1 ? "visitor" : "visitors"}`}
                />
              ))}
            </div>
            <div className="chart-x-axis" aria-hidden="true">
              <span>{first ? shortDate(first.date) : ""}</span>
              <span>{last ? "Today" : ""}</span>
            </div>
          </div>
        </div>
      )}

      <div className="activity-list">
        <div className="activity-row">
          <div className="activity-icon activity-violet">
            <Globe />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong>Where visitors come from</strong>
            <span>
              {totalSourced === 0
                ? "No referrer data yet"
                : traffic.sources
                    .map(
                      (source) =>
                        `${source.host ?? "Direct / unknown"} ${Math.round((source.views / totalSourced) * 100)}%`,
                    )
                    .join(" · ")}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

function CatalogueMetrics({ stats }: { stats: DashboardStats }) {
  const needsAttention = stats.inventory.lowStock + stats.inventory.outOfStock + stats.pricing.unpriced;

  return (
    <section className="metric-grid">
      <MetricCard
        label="Live products"
        value={number(stats.catalogue.active)}
        icon={Gem}
        footnote={`${number(stats.catalogue.variantCount)} variants · ${number(stats.catalogue.draft)} drafts`}
      />
      <MetricCard
        label="Units on hand"
        value={number(stats.inventory.unitsOnHand)}
        icon={Boxes}
        footnote={
          stats.inventory.unitsReserved > 0
            ? `${number(stats.inventory.unitsReserved)} reserved by open checkouts`
            : "Nothing reserved"
        }
      />
      <MetricCard
        label="Stock attention"
        value={number(needsAttention)}
        icon={PackageCheck}
        footnote={`${number(stats.inventory.lowStock)} low · ${number(stats.inventory.outOfStock)} out of stock`}
      />
      <MetricCard
        label="Customer accounts"
        value={number(stats.customers.total)}
        icon={Users}
        footnote={
          stats.customers.newThisMonth > 0
            ? `${number(stats.customers.newThisMonth)} joined this month`
            : "None joined this month"
        }
      />
    </section>
  );
}

function Restocking({ stats }: { stats: DashboardStats }) {
  return (
    <article className="panel sales-panel">
      <div className="panel-heading">
        <div>
          <h2>Needs restocking</h2>
          <p>Variants at or below their own low-stock threshold</p>
        </div>
        <Link href="/admin/inventory" className="text-button">
          Open inventory <ArrowUpRight />
        </Link>
      </div>

      {stats.attention.lowStockProducts.length === 0 ? (
        <div className="state-row" style={{ marginTop: 16 }}>Every active variant is comfortably in stock.</div>
      ) : (
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Available</th>
                <th>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {stats.attention.lowStockProducts.map((product) => (
                <tr key={`${product.id}-${product.sku}`}>
                  <td>
                    <div className="table-product">
                      <ProductMark label={product.title} keySeed={product.slug} />
                      <div>
                        <strong>{product.title}</strong>
                        <span>{product.slug}</span>
                      </div>
                    </div>
                  </td>
                  <td>{product.sku}</td>
                  <td className="table-strong">
                    {product.available <= 0 ? "Out of stock" : `${product.available} units`}
                  </td>
                  <td>{product.threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function CataloguePanel({ stats }: { stats: DashboardStats }) {
  return (
    <article className="panel activity-panel">
      <div className="panel-heading">
        <div>
          <h2>Catalogue</h2>
          <p>What your storefront is made of</p>
        </div>
        <Link href="/admin/products" className="text-button">
          Manage <ArrowUpRight />
        </Link>
      </div>

      <div className="activity-list">
        <div className="activity-row">
          <div className={`activity-icon ${stats.pricing.unpriced === 0 ? "activity-green" : "activity-amber"}`}>
            <Coins />
          </div>
          <div>
            <strong>
              {stats.pricing.unpriced === 0
                ? "All products priced"
                : `${number(stats.pricing.unpriced)} without a price`}
            </strong>
            <span>
              {stats.pricing.unpriced === 0
                ? "Every live product can be bought"
                : "These are live but cannot be bought"}
            </span>
          </div>
        </div>
        <div className="activity-row">
          <div className="activity-icon activity-violet">
            <Tags />
          </div>
          <div>
            <strong>{number(stats.taxonomy.categories)} categories</strong>
            <span>{number(stats.taxonomy.collections)} collections</span>
          </div>
        </div>
        <div className="activity-row">
          <div className="activity-icon activity-slate">
            <Gem />
          </div>
          <div>
            <strong>{number(stats.catalogue.total)} products in total</strong>
            <span>
              {number(stats.catalogue.active)} live · {number(stats.catalogue.draft)} drafts ·{" "}
              {number(stats.catalogue.archived)} archived
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function Drafts({ stats }: { stats: DashboardStats }) {
  if (stats.attention.draftProducts.length === 0) return null;

  return (
    <section className="panel orders-panel" style={{ marginTop: 16 }}>
      <div className="panel-heading">
        <div>
          <h2>Unpublished drafts</h2>
          <p>Written but not yet visible on the storefront</p>
        </div>
        <Link href="/admin/products?status=DRAFT" className="text-button">
          View all drafts <ArrowUpRight />
        </Link>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Last edited</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.attention.draftProducts.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="table-product">
                    <ProductMark label={product.title} keySeed={product.slug} />
                    <div>
                      <strong>{product.title}</strong>
                      <span>{product.slug}</span>
                    </div>
                  </div>
                </td>
                <td>{new Date(product.updatedAt).toLocaleDateString("en-IN")}</td>
                <td>
                  <Link href={`/admin/products/${product.id}`} className="text-button">
                    Continue editing
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
