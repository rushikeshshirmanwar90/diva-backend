"use client";

import { use, useEffect, useState } from "react";
import { api, AdminApiError, type ProductDetail } from "@/app/admin/_lib/api";
import { ProductEditor } from "@/app/admin/_components/product-editor";
import { ErrorRow, LoadingRow } from "@/app/admin/_components/ui";

/**
 * Edit an existing product.
 *
 * Loads through the admin endpoint keyed by id, which — unlike the public
 * `/products/:slug` — returns drafts and archived products, and returns the raw
 * stored fields rather than the priced view. The editor needs the pricing
 * *inputs* (weights, charges), not the computed output.
 *
 * `params` is a Promise in Next 16; `use()` unwraps it in a Client Component.
 */
export default function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = use(params);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await api.get<ProductDetail>(`/admin/products/${id}`);
        if (!cancelled) setProduct(data);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof AdminApiError ? caught.message : "Could not load that product.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <ErrorRow message={error} />;
  if (!product) return <LoadingRow label="Loading product…" />;

  return <ProductEditor product={product} />;
}
