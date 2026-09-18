"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  api,
  type AdminOrder,
  type OrderStatus,
  type PaginationMeta,
} from "@/app/admin/_lib/api";
import { money, number, when } from "@/app/admin/_lib/format";
import { ORDER_FILTERS, orderStatusMeta } from "@/app/admin/_lib/orders";
import {
  EmptyRow,
  ErrorDialog,
  ErrorRow,
  PageHeading,
  Pagination,
  StatusBadge,
  TableSkeleton,
  Toolbar,
} from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";

/**
 * Orders.
 *
 * A fulfilment desk works this screen top to bottom: filter to "To ship",
 * open each order, file the shipment, come back. So the filter is in the
 * URL (`?status=CONFIRMED`) — the dashboard links straight into a queue, and
 * the browser's Back button returns to the same queue, same page, after an
 * order has been dealt with.
 */

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status");
  const status: OrderStatus | "ALL" =
    statusParam && ORDER_FILTERS.some((f) => f.key === statusParam)
      ? (statusParam as OrderStatus)
      : "ALL";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const search = searchParams.get("q") ?? "";

  const [draftSearch, setDraftSearch] = useState(search);

  const navigate = (next: { status?: OrderStatus | "ALL"; page?: number; q?: string }) => {
    const params = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextQ = next.q ?? search;
    const nextPage = next.page ?? 1;
    if (nextStatus !== "ALL") params.set("status", nextStatus);
    if (nextQ) params.set("q", nextQ);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    router.push(query ? `/admin/orders?${query}` : "/admin/orders");
  };

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const response = await api.get<AdminOrder[]>("/admin/orders", {
        page,
        limit: PAGE_SIZE,
        status: status === "ALL" ? undefined : status,
        search: search || undefined,
      });
      return {
        orders: response.data,
        meta: (response.meta as unknown as PaginationMeta) ?? null,
      };
    },
    [page, status, search],
    { errorMessage: "Could not load orders." },
  );

  const orders = data?.orders ?? [];
  const meta = data?.meta ?? null;
  const errorDialog = useErrorDialog(error, reload);

  return (
    <>
      <PageHeading
        eyebrow="Sales"
        title="Orders"
        description="Every order placed on the storefront, newest first."
      />

      <div className="filter-strip">
        <form
          className="inline-search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ q: draftSearch.trim(), page: 1 });
          }}
        >
          <Search />
          <input
            name="q"
            aria-label="Search orders"
            placeholder="Order number or customer email"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
          />
        </form>
      </div>

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {ORDER_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`chip${status === filter.key ? " chip-selected" : ""}`}
            onClick={() => navigate({ status: filter.key, page: 1 })}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="panel list-panel">
        <Toolbar count={meta?.total ?? orders.length} />

        {error && <ErrorRow message={error} onRetry={reload} />}

        {loading ? (
          <TableSkeleton
            columns={6}
            headers={["Order", "Customer", "Items", "Payment", "Total", "Status"]}
            label="Loading orders…"
            trailingActions={false}
          />
        ) : error ? null : orders.length === 0 ? (
          <EmptyRow
            title={search || status !== "ALL" ? "No orders match" : "No orders yet"}
            description={
              search || status !== "ALL"
                ? "Try another status or search term."
                : "Orders appear here the moment a customer places one."
            }
          />
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
                {orders.map((order) => {
                  const badge = orderStatusMeta(order.status);
                  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
                  return (
                    <tr key={order._id}>
                      <td>
                        <div className="table-product">
                          <div>
                            <Link
                              href={`/admin/orders/${order.orderNumber}`}
                              style={{ color: "inherit", textDecoration: "none" }}
                            >
                              <strong>{order.orderNumber}</strong>
                            </Link>
                            <span>{when(order.createdAt)}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="table-product">
                          <div>
                            <strong>{order.shippingAddress?.fullName || "—"}</strong>
                            <span>{order.customerEmail}</span>
                          </div>
                        </div>
                      </td>
                      <td>{number(itemCount)}</td>
                      <td>
                        <span className={`method-pill${order.paymentMethod === "COD" ? " is-cod" : ""}`}>
                          {order.paymentMethod === "COD" ? "COD" : order.paymentMethod === "PHONEPE" ? "PhonePe" : "Manual"}
                        </span>
                      </td>
                      <td className="table-strong">{money(order.totals.grandTotalPaise)}</td>
                      <td>
                        <Link href={`/admin/orders/${order.orderNumber}`} style={{ textDecoration: "none" }}>
                          <StatusBadge label={badge.label} tone={badge.tone} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {meta && (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            onChange={(next) => navigate({ page: next })}
          />
        )}
      </div>

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load orders"
        message={error}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
