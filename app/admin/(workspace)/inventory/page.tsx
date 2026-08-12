"use client";

import Link from "next/link";
import { useState } from "react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import { ArrowUpRight, Bell, Check, X } from "lucide-react";
import {
  api,
  AdminApiError,
  type DashboardStats,
  type ProductListItem,
} from "@/app/admin/_lib/api";
import { colourLabel, number } from "@/app/admin/_lib/format";
import {
  EmptyRow,
  ErrorDialog,
  ErrorRow,
  PageHeading,
  ProductMark,
  StockBadge,
  TableSkeleton,
  Toolbar,
} from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/**
 * Inventory.
 *
 * Stock is edited inline, per variant, and written as an **absolute** value —
 * the API takes a count, not a delta. A delta applied twice (a retried request,
 * a double-clicked save) silently drifts the number, and inventory that
 * disagrees with the shelf only surfaces when an order cannot be fulfilled.
 */
export default function InventoryPage() {
  const { notify } = useToast();

  const [editing, setEditing] = useState<{ productId: string; variantId: string } | null>(null);
  const [draftStock, setDraftStock] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [statsResponse, productResponse] = await Promise.all([
        api.get<DashboardStats>("/admin/stats"),
        api.get<ProductListItem[]>("/products", { limit: 100, status: "ACTIVE" }),
      ]);
      return { stats: statsResponse.data, products: productResponse.data };
    },
    [],
    { errorMessage: "Could not load inventory." },
  );

  const stats = data?.stats ?? null;
  const products = data?.products ?? [];

  const errorDialog = useErrorDialog(error, reload);

  const saveStock = async (productId: string, variantId: string) => {
    setSaving(true);
    try {
      await api.patch(`/admin/products/${productId}/stock`, {
        variantId,
        stock: Number(draftStock) || 0,
      });
      notify("Stock updated");
      setEditing(null);
      await reload();
    } catch (caught) {
      notify(caught instanceof AdminApiError ? caught.message : "Could not update stock.");
    } finally {
      setSaving(false);
    }
  };

  const rows = products.flatMap((product) =>
    product.variants
      .filter((variant) => variant.isActive)
      .map((variant) => ({
        product,
        variant,
        available: Math.max(0, variant.stock - variant.reservedStock),
      })),
  );

  const attention = rows.filter((row) => row.available <= row.variant.lowStockThreshold);

  return (
    <>
      <PageHeading
        eyebrow="Catalog"
        title="Inventory"
        description="Know what is available, what is reserved, and what needs attention."
      />

      {stats && (
        <div className="order-summary-row">
          <div>
            <span>Units on hand</span>
            <strong>{number(stats.inventory.unitsOnHand)}</strong>
          </div>
          <div>
            <span>Reserved</span>
            <strong>{number(stats.inventory.unitsReserved)}</strong>
          </div>
          <div>
            <span>Low stock</span>
            <strong>{number(stats.inventory.lowStock)}</strong>
          </div>
          <div>
            <span>Out of stock</span>
            <strong>{number(stats.inventory.outOfStock)}</strong>
          </div>
        </div>
      )}

      {attention.length > 0 && (
        <div className="inventory-alert">
          <div className="alert-icon">
            <Bell />
          </div>
          <div>
            <strong>
              {attention.length} variant{attention.length === 1 ? "" : "s"} need
              {attention.length === 1 ? "s" : ""} your attention
            </strong>
            <span>Restock before your next marketing push.</span>
          </div>
          <Link href="/admin/products" className="text-button" style={{ marginLeft: "auto" }}>
            Manage products <ArrowUpRight />
          </Link>
        </div>
      )}

      <div className="panel list-panel">
        <Toolbar count={rows.length} />

        {error && <ErrorRow message={error} onRetry={reload} />}

        {loading ? (
          <TableSkeleton
            columns={8}
            headers={[
              "Product",
              "SKU",
              "Colour",
              "On hand",
              "Reserved",
              "Available",
              "Status",
              "",
            ]}
            label="Loading inventory…"
          />
        ) : /* A failed load must not be reported as "Nothing in stock yet". */
        error ? null : rows.length === 0 ? (
          <EmptyRow
            title="Nothing in stock yet"
            description="Publish a product with variants and its stock will appear here."
            action="Add product"
            actionHref="/admin/products/new"
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Colour</th>
                  <th>On hand</th>
                  <th>Reserved</th>
                  <th>Available</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ product, variant, available }) => {
                  const isEditing =
                    editing?.productId === product._id && editing?.variantId === variant._id;

                  return (
                    <tr key={`${product._id}-${variant._id}`}>
                      <td>
                        <div className="table-product">
                          <ProductMark label={product.title} keySeed={product.slug} />
                          <div>
                            <strong>{product.title}</strong>
                            <span>{variant.size ? `Size ${variant.size}` : "One size"}</span>
                          </div>
                        </div>
                      </td>
                      <td>{variant.sku}</td>
                      <td>{colourLabel(variant.colour)}</td>
                      <td className="table-strong">
                        {isEditing ? (
                          <input
                            value={draftStock}
                            onChange={(event) => setDraftStock(event.target.value)}
                            inputMode="numeric"
                            autoFocus
                            style={{
                              width: 68,
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid var(--ring)",
                            }}
                          />
                        ) : (
                          variant.stock
                        )}
                      </td>
                      <td>{variant.reservedStock}</td>
                      <td className="table-strong">{available}</td>
                      <td>
                        <StockBadge
                          available={available}
                          threshold={variant.lowStockThreshold}
                        />
                      </td>
                      <td>
                        {isEditing ? (
                          <>
                            <button
                              className="row-action"
                              disabled={saving}
                              onClick={() => saveStock(product._id, variant._id)}
                              aria-label="Save stock"
                            >
                              <Check />
                            </button>
                            <button
                              className="row-action"
                              onClick={() => setEditing(null)}
                              aria-label="Cancel"
                            >
                              <X />
                            </button>
                          </>
                        ) : (
                          <button
                            className="text-button"
                            onClick={() => {
                              setEditing({ productId: product._id, variantId: variant._id });
                              setDraftStock(String(variant.stock));
                            }}
                          >
                            Adjust
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load inventory"
        message={error}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
