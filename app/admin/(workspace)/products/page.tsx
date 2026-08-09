"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Search, Trash2 } from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  api,
  AdminApiError,
  type ProductListItem,
  type Category,
  type PaginationMeta,
} from "@/app/admin/_lib/api";
import { colourLabel, money } from "@/app/admin/_lib/format";
import {
  EmptyRow,
  ErrorRow,
  LoadingRow,
  PageHeading,
  Pagination,
  ProductMark,
  ProductStatusBadge,
  StockBadge,
  Toolbar,
} from "@/app/admin/_components/ui";
import { useToast } from "@/app/admin/_components/shell";

/**
 * Product list.
 *
 * Filter and search state lives in the URL rather than in component state. The
 * design kept it local, which means a filtered view cannot be linked, survives
 * no refresh, and is lost the moment you open a product and come back — the
 * last of which is the common case, since you filter precisely in order to go
 * edit something.
 *
 * Filtering happens server-side through the same faceted aggregation the
 * storefront uses, so the counts shown are the real ones rather than a count of
 * whatever happened to be on the current page.
 */
export default function ProductsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { notify } = useToast();

  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const category = params.get("category") ?? "";

  const [showFilters, setShowFilters] = useState(Boolean(status || category));

  const setParam = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams(params.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }

      // Any change to the filters invalidates the page number — staying on
      // page 4 of a newly-narrowed result set shows an empty screen.
      if (!("page" in updates)) next.delete("page");

      router.replace(`/admin/products?${next.toString()}`);
    },
    [params, router],
  );

  const {
    data: result,
    loading,
    error,
    reload,
  } = useAsyncData(
    async () => {
      const response = await api.get<ProductListItem[]>("/products", {
        page,
        limit: 20,
        q: q || undefined,
        status: status || undefined,
        category: category || undefined,
        // Text relevance is only meaningful alongside a search term; without
        // one it degrades to an arbitrary order, so fall back to newest.
        sort: q ? "relevance" : "newest",
      });

      return {
        items: response.data,
        meta: (response.meta as unknown as PaginationMeta) ?? null,
      };
    },
    [page, q, status, category],
    { errorMessage: "Could not load products." },
  );

  const items = result?.items ?? [];
  const meta = result?.meta ?? null;

  // A failed category fetch only costs the filter dropdown and the category
  // column; the list itself stays usable, so its error is not surfaced.
  const { data: categories } = useAsyncData(
    async () => (await api.get<Category[]>("/categories", { includeInactive: true })).data,
    [],
  );

  const categoryName = useMemo(() => {
    const map = new Map((categories ?? []).map((entry) => [entry._id, entry.name]));
    return (ids: string[]) =>
      ids
        .map((id) => map.get(id))
        .filter(Boolean)
        .join(", ") || "—";
  }, [categories]);

  const remove = async (product: ProductListItem) => {
    if (!window.confirm(`Archive "${product.title}"? It will be hidden from the storefront.`)) {
      return;
    }

    try {
      await api.delete(`/admin/products/${product._id}`);
      notify(`${product.title} archived`);
      void reload();
    } catch (caught) {
      notify(caught instanceof AdminApiError ? caught.message : "Could not archive that product.");
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Catalog"
        title="Products"
        description="Manage your jewellery catalogue, variants, weights and pricing inputs."
        action="Add product"
        actionHref="/admin/products/new"
      />

      <div className="filter-strip">
        {/*
          Keyed on `q` and uncontrolled. Remounting when the URL query changes
          resyncs the box — including when the header search navigates here —
          without an effect that writes state during render.
        */}
        <form
          key={q}
          className="inline-search"
          onSubmit={(event) => {
            event.preventDefault();
            const field = event.currentTarget.elements.namedItem("q") as HTMLInputElement;
            setParam({ q: field.value });
          }}
        >
          <Search />
          <input
            name="q"
            aria-label="Search products"
            placeholder="Search products, SKU, or category"
            defaultValue={q}
          />
        </form>

        {showFilters && (
          <div className="filter-pills">
            <label>
              <span className="sr-only">Filter by category</span>
              <select
                value={category}
                onChange={(event) => setParam({ category: event.target.value })}
              >
                <option value="">All categories</option>
                {(categories ?? []).map((entry) => (
                  <option key={entry._id} value={entry._id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select value={status} onChange={(event) => setParam({ status: event.target.value })}>
                <option value="">All status</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            {(status || category || q) && (
              <button
                className="secondary-button"
                onClick={() => setParam({ status: "", category: "", q: "" })}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="panel list-panel">
        <Toolbar
          count={meta?.total ?? items.length}
          action="Add product"
          actionHref="/admin/products/new"
          onToggleFilters={() => setShowFilters((current) => !current)}
          showFilters={showFilters}
        />

        {error && <ErrorRow message={error} onRetry={reload} />}

        {loading ? (
          <LoadingRow label="Loading products…" />
        ) : items.length === 0 ? (
          <EmptyRow
            title={q || status || category ? "No products match those filters" : "No products yet"}
            description={
              q || status || category
                ? "Try a broader search, or clear the filters to see the whole catalogue."
                : "Add your first piece to start building the catalogue."
            }
            action={q || status || category ? undefined : "Add product"}
            actionHref="/admin/products/new"
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Inventory</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => {
                  const available = product.variants
                    .filter((variant) => variant.isActive)
                    .reduce(
                      (total, variant) =>
                        total + Math.max(0, variant.stock - variant.reservedStock),
                      0,
                    );

                  return (
                    <tr key={product._id}>
                      <td>
                        <div className="table-product">
                          <ProductMark
                            label={product.title}
                            keySeed={product.slug}
                            imageUrl={product.images?.[0]?.url}
                          />
                          <div>
                            <strong>{product.title}</strong>
                            <span>
                              {product.variants.length}{" "}
                              {product.variants.length === 1 ? "variant" : "variants"}
                              {product.variants[0] &&
                                ` · ${colourLabel(product.variants[0].colour)}`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{categoryName(product.categoryIds)}</td>
                      <td className="table-strong">
                        {money(product.pricePaise)}
                      </td>
                      <td>{available} units</td>
                      <td>
                        {product.status === "ACTIVE" ? (
                          <StockBadge available={available} threshold={2} />
                        ) : (
                          <ProductStatusBadge status={product.status} />
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/admin/products/${product._id}`}
                          className="row-action-link"
                          aria-label={`Edit ${product.title}`}
                        >
                          <Pencil />
                        </Link>
                        <button
                          className="row-action"
                          onClick={() => remove(product)}
                          aria-label={`Archive ${product.title}`}
                        >
                          <Trash2 />
                        </button>
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
            onChange={(nextPage) => setParam({ page: nextPage })}
          />
        )}
      </div>
    </>
  );
}
