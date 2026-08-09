"use client";

import Link from "next/link";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  Coins,
  Gem,
  PackageCheck,
  Tags,
  Users,
} from "lucide-react";
import { api, type DashboardStats } from "@/app/admin/_lib/api";
import { dateOnly, number } from "@/app/admin/_lib/format";
import {
  ErrorRow,
  LoadingRow,
  MetricCard,
  PageHeading,
  ProductMark,
} from "@/app/admin/_components/ui";

/**
 * Overview.
 *
 * The design's version led with Gross sales, Orders, Average order value and
 * Returning customers, plus a 30-day revenue chart. None of those exist yet —
 * orders are Phase 4 — so this leads with what the store actually knows:
 * catalogue size, inventory health, unpriced products and customers.
 *
 * The revenue chart is not rendered as an empty axis either. A chart with no
 * data is visual noise that implies something failed to load; the space goes to
 * the two lists an admin can act on today.
 */
export default function OverviewPage() {
  const { data: stats, error, reload } = useAsyncData(
    async () => (await api.get<DashboardStats>("/admin/stats")).data,
    [],
    { errorMessage: "We could not load your dashboard." },
  );

  if (error) {
    return (
      <>
        <PageHeading eyebrow={dateOnly(new Date())} title="Overview" description="Your store at a glance." />
        <ErrorRow message={error} onRetry={reload} />
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <PageHeading eyebrow={dateOnly(new Date())} title="Overview" description="Your store at a glance." />
        <div className="panel">
          <LoadingRow label="Loading your dashboard…" />
        </div>
      </>
    );
  }

  const needsAttention =
    stats.inventory.lowStock + stats.inventory.outOfStock + stats.pricing.unpriced;

  return (
    <>
      <PageHeading
        eyebrow={dateOnly(new Date())}
        title="Your catalogue today"
        description="Everything your storefront is currently able to sell."
        action="Add product"
        actionHref="/admin/products/new"
      />

      {stats.pricing.unpriced > 0 && (
        <div className="rate-warning">
          <div className="alert-icon">
            <AlertTriangle />
          </div>
          <div>
            <strong>
              {stats.pricing.unpriced} published{" "}
              {stats.pricing.unpriced === 1 ? "product has" : "products have"} no price
            </strong>
            <span>
              {stats.pricing.unpriced === 1 ? "It is" : "They are"} visible in the storefront but
              cannot be added to a bag until a price is set.
            </span>
          </div>
          <Link href="/admin/products" className="text-button" style={{ marginLeft: "auto" }}>
            Set a price <ArrowUpRight />
          </Link>
        </div>
      )}

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
          label="Needs attention"
          value={number(needsAttention)}
          icon={PackageCheck}
          footnote={`${number(stats.inventory.lowStock)} low · ${number(stats.inventory.outOfStock)} out of stock`}
        />
        <MetricCard
          label="Customers"
          value={number(stats.customers.total)}
          icon={Users}
          footnote={
            stats.customers.newThisMonth > 0
              ? `${number(stats.customers.newThisMonth)} joined this month`
              : "None joined this month"
          }
        />
      </section>

      <section className="overview-grid">
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
            <div className="state-row">Every active variant is comfortably in stock.</div>
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
              <div className="activity-icon activity-amber">
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
          </div>
        </article>
      </section>

      {stats.attention.draftProducts.length > 0 && (
        <section className="panel orders-panel">
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
      )}

      <section className="panel" style={{ padding: "17px 22px", marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Sales reporting</h2>
            <p>
              Revenue, order counts and conversion appear here once checkout ships. Nothing
              is shown in the meantime rather than placeholder figures.
            </p>
          </div>
          <span className="pending-phase" style={{ marginTop: 0 }}>
            Phase 4
          </span>
        </div>
      </section>
    </>
  );
}
