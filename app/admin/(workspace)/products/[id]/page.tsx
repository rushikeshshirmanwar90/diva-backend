"use client";

import { use } from "react";
import { api, type ProductDetail } from "@/app/admin/_lib/api";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { ProductEditor } from "@/app/admin/_components/product-editor";
import { EditorSkeleton, ErrorDialog, ErrorRow } from "@/app/admin/_components/ui";

/**
 * Edit an existing product.
 *
 * Loads through the admin endpoint keyed by id, which — unlike the public
 * `/products/:slug` — returns drafts and archived products, and returns the raw
 * stored fields rather than the priced view. The editor needs the pricing
 * *inputs* (weights, charges), not the computed output.
 *
 * `params` is a Promise in Next 16; `use()` unwraps it in a Client Component.
 *
 * The fetch was hand-rolled in an effect, which meant a failure here was
 * terminal: the message rendered with no way to try again short of reloading
 * the browser. `useAsyncData` supplies the same cancellation with a `reload`
 * attached, so the dialog can offer a retry.
 */
export default function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = use(params);

  const {
    data: product,
    loading,
    error,
    reload,
  } = useAsyncData(
    async () => (await api.get<ProductDetail>(`/admin/products/${id}`)).data,
    [id],
    { errorMessage: "Could not load that product." },
  );

  const errorDialog = useErrorDialog(error, reload);

  return (
    <>
      {error && <ErrorRow message={error} onRetry={reload} />}

      {loading ? (
        <EditorSkeleton label="Loading product…" />
      ) : (
        product && <ProductEditor product={product} />
      )}

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load that product"
        message={error}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
