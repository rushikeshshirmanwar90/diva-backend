"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IndianRupee, Pencil, Search, Trash2, X } from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  api,
  AdminApiError,
  type ProductListItem,
  type Category,
  type DashboardStats,
  type PaginationMeta,
} from "@/app/admin/_lib/api";
import { colourLabel, money, number } from "@/app/admin/_lib/format";
import {
  ConfirmDialog,
  EmptyRow,
  ErrorDialog,
  ErrorRow,
  PageHeading,
  Pagination,
  ProductMark,
  ProductStatusBadge,
  StockBadge,
  TableSkeleton,
  Toolbar,
} from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
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
  const sort = params.get("sort") ?? "";
  const inStockOnly = params.get("inStock") === "true";

  const [showFilters, setShowFilters] = useState(
    Boolean(status || category || sort || inStockOnly),
  );

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

  // --- Search box -----------------------------------------------------------

  /**
   * Uncontrolled and keyed on `q`, like the rest of this page's filters. That
   * remount is what resyncs the box when a search is set from outside it — the
   * header search, browser back/forward, "Clear" — without a controlled
   * `value` prop and the render-time resync that would need.
   *
   * Typing debounces into the URL via `onChange`; Enter still commits
   * immediately, for anyone who types fast and expects that to just work.
   */
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const commitSearch = useCallback(
    (value: string) => {
      clearTimeout(debounceRef.current);
      setParam({ q: value });
    },
    [setParam],
  );

  const onSearchChange = (value: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commitSearch(value), 350);
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Text relevance is only meaningful alongside a search term. An explicit
  // sort picked from the dropdown always wins; absent one, a search ranks by
  // relevance and a plain browse falls back to newest.
  const effectiveSort = sort || (q ? "relevance" : "newest");

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
        inStock: inStockOnly || undefined,
        sort: effectiveSort,
      });

      return {
        items: response.data,
        meta: (response.meta as unknown as PaginationMeta) ?? null,
      };
    },
    [page, q, status, category, sort, inStockOnly],
    { errorMessage: "Could not load products." },
  );

  const items = result?.items ?? [];
  const meta = result?.meta ?? null;

  const errorDialog = useErrorDialog(error, reload);

  // A failed category fetch only costs the filter dropdown and the category
  // column; the list itself stays usable, so its error is not surfaced.
  const { data: categories } = useAsyncData(
    async () => (await api.get<Category[]>("/categories", { includeInactive: true })).data,
    [],
  );

  // Same treatment: the catalogue summary strip is a bonus, not the page —
  // if it fails to load, the table underneath is still fully usable.
  const { data: stats } = useAsyncData(
    async () => (await api.get<DashboardStats>("/admin/stats")).data,
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

  const [pendingArchive, setPendingArchive] = useState<ProductListItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  const confirmArchive = async () => {
    if (!pendingArchive) return;

    setArchiving(true);
    try {
      await api.delete(`/admin/products/${pendingArchive._id}`);
      notify(`${pendingArchive.title} archived`);
      setPendingArchive(null);
      void reload();
    } catch (caught) {
      notify(caught instanceof AdminApiError ? caught.message : "Could not archive that product.");
    } finally {
      setArchiving(false);
    }
  };

  const activeFilterCount = [status, category, sort, inStockOnly].filter(Boolean).length;

  return (
    <>
      <PageHeading
        eyebrow="Catalog"
        title="Products"
        description="Manage your jewellery catalogue, variants, weights and pricing inputs."
        action="Add product"
        actionHref="/admin/products/new"
      />

      {stats && (
        <div className="order-summary-row">
          <div>
            <span>Total products</span>
            <strong>{number(stats.catalogue.total)}</strong>
          </div>
          <div>
            <span>Active</span>
            <strong>{number(stats.catalogue.active)}</strong>
          </div>
          <div>
            <span>Draft</span>
            <strong>{number(stats.catalogue.draft)}</strong>
          </div>
          <div>
            <span>Archived</span>
            <strong>{number(stats.catalogue.archived)}</strong>
          </div>
        </div>
      )}

      {stats && stats.pricing.unpriced > 0 && (
        <div className="inventory-alert">
          <div className="alert-icon">
            <IndianRupee />
          </div>
          <div>
            <strong>
              {stats.pricing.unpriced} product{stats.pricing.unpriced === 1 ? "" : "s"} can&apos;t
              be bought yet
            </strong>
            <span>No usable price is set, so the storefront hides their buy button.</span>
          </div>
        </div>
      )}

      <div className="filter-strip">
        <form
          key={q}
          className="inline-search"
          onSubmit={(event) => {
            event.preventDefault();
            const field = event.currentTarget.elements.namedItem("q") as HTMLInputElement;
            commitSearch(field.value);
          }}
        >
          <Search />
          <input
            ref={searchInputRef}
            name="q"
            aria-label="Search products"
            placeholder="Search products, SKU, or category"
            defaultValue={q}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {q && (
            <button
              type="button"
              className="icon-button"
              aria-label="Clear search"
              onClick={() => {
                clearTimeout(debounceRef.current);
                if (searchInputRef.current) searchInputRef.current.value = "";
                commitSearch("");
                searchInputRef.current?.focus();
              }}
            >
              <X />
            </button>
          )}
        </form>

        <label className="sort-field">
          <span className="sr-only">Sort by</span>
          <select
            value={effectiveSort}
            onChange={(event) => setParam({ sort: event.target.value })}
          >
            {q && <option value="relevance">Best match</option>}
            <option value="newest">Newest first</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="popular">Best selling</option>
          </select>
        </label>

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
            <button
              type="button"
              className={`secondary-button ${inStockOnly ? "button-selected" : ""}`}
              aria-pressed={inStockOnly}
              onClick={() => setParam({ inStock: inStockOnly ? undefined : "true" })}
            >
              In stock only
            </button>
            {activeFilterCount > 0 && (
              <button
                className="secondary-button"
                onClick={() =>
                  setParam({ status: "", category: "", sort: "", inStock: "", q: "" })
                }
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
          <TableSkeleton
            columns={6}
            headers={["Product", "Category", "Price", "Inventory", "Status", ""]}
            label="Loading products…"
          />
        ) : /*
             A failed load leaves `items` empty, and the empty state would then
             claim "No products yet — add your first piece". That is a lie about
             the catalogue and invites an admin to re-create products that exist.
             The error row above is the whole story in that case.
           */
        error ? null : items.length === 0 ? (
          <EmptyRow
            title={
              q || status || category || inStockOnly
                ? "No products match those filters"
                : "No products yet"
            }
            description={
              q || status || category || inStockOnly
                ? "Try a broader search, or clear the filters to see the whole catalogue."
                : "Add your first piece to start building the catalogue."
            }
            action={q || status || category || inStockOnly ? undefined : "Add product"}
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
                  const activeVariants = product.variants.filter((variant) => variant.isActive);
                  const available = activeVariants.reduce(
                    (total, variant) => total + Math.max(0, variant.stock - variant.reservedStock),
                    0,
                  );
                  const lowStockVariants = activeVariants.filter(
                    (variant) =>
                      Math.max(0, variant.stock - variant.reservedStock) <=
                      variant.lowStockThreshold,
                  ).length;

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
                        {product.pricePaise > 0 ? (
                          money(product.pricePaise)
                        ) : (
                          <span
                            style={{ color: "#b45309", fontWeight: 600 }}
                            title="No usable price is set — the storefront hides this product's buy button"
                          >
                            Not priced
                          </span>
                        )}
                      </td>
                      <td>
                        {available} units
                        {lowStockVariants > 0 && (
                          <span className="item-count">
                            {lowStockVariants} of {activeVariants.length} variant
                            {activeVariants.length === 1 ? "" : "s"} low
                          </span>
                        )}
                      </td>
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
                          onClick={() => setPendingArchive(product)}
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

      <ConfirmDialog
        open={pendingArchive != null}
        title="Archive this product?"
        message={
          pendingArchive
            ? `"${pendingArchive.title}" will be hidden from the storefront immediately. You can restore it later by setting its status back to Active.`
            : ""
        }
        confirmLabel="Archive"
        busy={archiving}
        onConfirm={confirmArchive}
        onCancel={() => setPendingArchive(null)}
      />

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load products"
        message={error}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
