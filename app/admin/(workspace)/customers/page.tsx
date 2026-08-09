"use client";

import { useState } from "react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import { Check, Gem, Search, ShieldOff, Users } from "lucide-react";
import {
  api,
  AdminApiError,
  type Customer,
  type DashboardStats,
  type PaginationMeta,
} from "@/app/admin/_lib/api";
import { initials, number, when } from "@/app/admin/_lib/format";
import {
  EmptyRow,
  ErrorRow,
  LoadingRow,
  PageHeading,
  Pagination,
  StatusBadge,
  Toolbar,
} from "@/app/admin/_components/ui";
import { useToast } from "@/app/admin/_components/shell";
import { tone } from "@/app/admin/_lib/format";

/**
 * Customers.
 *
 * The design showed "Orders" and "Total spent" per customer. Both are derived
 * from order history, which does not exist yet — so those columns are replaced
 * with facts the system actually holds: verification state, marketing consent
 * and last sign-in. They will come back when Phase 4 lands.
 */
export default function CustomersPage() {
  const { notify } = useToast();

  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState("");

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [customerResponse, statsResponse] = await Promise.all([
        api.get<Customer[]>("/admin/customers", {
          page,
          limit: 20,
          role: "customer",
          search: applied || undefined,
        }),
        api.get<DashboardStats>("/admin/stats"),
      ]);

      return {
        customers: customerResponse.data,
        meta: (customerResponse.meta as unknown as PaginationMeta) ?? null,
        stats: statsResponse.data,
      };
    },
    [page, applied],
    { errorMessage: "Could not load customers." },
  );

  const customers = data?.customers ?? [];
  const meta = data?.meta ?? null;
  const stats = data?.stats ?? null;

  const toggleActive = async (customer: Customer) => {
    const suspending = customer.isActive;

    if (
      suspending &&
      !window.confirm(
        `Suspend ${customer.name}? They will be signed out everywhere immediately and cannot sign back in.`,
      )
    ) {
      return;
    }

    try {
      await api.patch(`/admin/customers/${customer.id}`, { isActive: !customer.isActive });
      notify(suspending ? `${customer.name} suspended` : `${customer.name} restored`);
      await reload();
    } catch (caught) {
      notify(caught instanceof AdminApiError ? caught.message : "Could not update that account.");
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Relationships"
        title="Customers"
        description="Understand your community and manage account access."
      />

      {stats && (
        <div className="customer-metrics">
          <div>
            <Users />
            <span>Total customers</span>
            <strong>{number(stats.customers.total)}</strong>
            <small>
              {stats.customers.newThisMonth > 0
                ? `+${number(stats.customers.newThisMonth)} this month`
                : "None joined this month"}
            </small>
          </div>
          <div>
            <Check />
            <span>Email verified</span>
            <strong>{number(stats.customers.verified)}</strong>
            <small>
              {stats.customers.total > 0
                ? `${Math.round((stats.customers.verified / stats.customers.total) * 100)}% of accounts`
                : "No accounts yet"}
            </small>
          </div>
          <div>
            <Gem />
            <span>Lifetime value</span>
            <strong>—</strong>
            <small>Available once orders ship</small>
          </div>
        </div>
      )}

      <div className="filter-strip">
        <form
          key={applied}
          className="inline-search"
          onSubmit={(event) => {
            event.preventDefault();
            const field = event.currentTarget.elements.namedItem("q") as HTMLInputElement;
            setPage(1);
            setApplied(field.value);
          }}
        >
          <Search />
          <input
            name="q"
            aria-label="Search customers"
            placeholder="Search by name or email"
            defaultValue={applied}
          />
        </form>
      </div>

      <div className="panel list-panel">
        <Toolbar count={meta?.total ?? customers.length} />

        {error && <ErrorRow message={error} onRetry={reload} />}

        {loading ? (
          <LoadingRow label="Loading customers…" />
        ) : customers.length === 0 ? (
          <EmptyRow
            title={applied ? "No customers match that search" : "No customers yet"}
            description={
              applied
                ? "Try a different name or email address."
                : "Customer accounts appear here as people register on the storefront."
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Marketing</th>
                  <th>Last sign-in</th>
                  <th>Joined</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="table-product">
                        <div className={`customer-mark product-mark-${tone(customer.email)}`}>
                          {initials(customer.name)}
                        </div>
                        <div>
                          <strong>{customer.name}</strong>
                          <span>{customer.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {!customer.isActive ? (
                        <StatusBadge label="Suspended" tone="low" />
                      ) : customer.emailVerified ? (
                        <StatusBadge label="Verified" tone="stock" />
                      ) : (
                        <StatusBadge label="Unverified" tone="processing" />
                      )}
                    </td>
                    <td>{customer.marketingOptIn ? "Subscribed" : "—"}</td>
                    <td>{when(customer.lastLoginAt)}</td>
                    <td>{when(customer.createdAt)}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => toggleActive(customer)}
                        title={customer.isActive ? "Suspend account" : "Restore account"}
                      >
                        {customer.isActive ? (
                          <>
                            <ShieldOff /> Suspend
                          </>
                        ) : (
                          <>
                            <Check /> Restore
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />}
      </div>
    </>
  );
}
