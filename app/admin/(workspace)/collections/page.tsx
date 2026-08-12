"use client";

import { useState } from "react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api, AdminApiError, type Collection, type ProductListItem } from "@/app/admin/_lib/api";
import { number } from "@/app/admin/_lib/format";
import {
  EmptyRow,
  ErrorDialog,
  ErrorRow,
  PageHeading,
  StatusBadge,
  Toolbar,
  TreeSkeleton,
} from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/**
 * Collections — the merchandising campaigns.
 *
 * Distinct from categories: a category says what an item *is* (a ring), a
 * collection says why you would buy it *now* (it is bridal season). They are
 * time-boxed, so the editor exposes the campaign window, and the list shows
 * whether each one is live at this moment rather than just whether it is
 * enabled.
 */

type Draft = {
  name: string;
  description: string;
  productIds: string[];
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  isFeatured: boolean;
  displayOrder: string;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  productIds: [],
  startsAt: "",
  endsAt: "",
  isActive: true,
  isFeatured: false,
  displayOrder: "0",
};

/** `2026-08-07T09:41:55.248Z` → `2026-08-07T09:41`, what datetime-local wants. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isLive(collection: Collection): boolean {
  if (!collection.isActive) return false;
  const now = Date.now();
  if (collection.startsAt && now < new Date(collection.startsAt).getTime()) return false;
  if (collection.endsAt && now > new Date(collection.endsAt).getTime()) return false;
  return true;
}

export default function CollectionsPage() {
  const { notify } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useAsyncData(
    async () => {
      const [collectionResponse, productResponse] = await Promise.all([
        api.get<Collection[]>("/collections"),
        api.get<ProductListItem[]>("/products", { limit: 100 }),
      ]);
      return { collections: collectionResponse.data, products: productResponse.data };
    },
    [],
    { errorMessage: "Could not load collections." },
  );

  const collections = data?.collections ?? [];

  const products = data?.products ?? [];
  const error = formError || loadError;

  /**
   * Bound to `loadError`, not to the combined `error`.
   *
   * The dialog's only action is "Try again", which calls `reload()` — and
   * reloading the list does nothing for a *save* that failed. A form error
   * belongs beside the form it came from.
   */
  const errorDialog = useErrorDialog(loadError, reload);

  const cancel = () => {
    setEditingId(null);
    setCreating(false);
    setDraft(emptyDraft);
    setFormError("");
  };

  const startEdit = (collection: Collection) => {
    setCreating(false);
    setEditingId(collection._id);
    setDraft({
      name: collection.name,
      description: collection.description ?? "",
      productIds: collection.productIds ?? [],
      startsAt: toLocalInput(collection.startsAt),
      endsAt: toLocalInput(collection.endsAt),
      isActive: collection.isActive,
      isFeatured: collection.isFeatured,
      displayOrder: String(collection.displayOrder),
    });
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setFormError("Give the collection a name.");
      return;
    }

    setSaving(true);
    setFormError("");

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      productIds: draft.productIds,
      // datetime-local yields a naive local string; the API validates ISO, so
      // convert through Date to get a proper UTC instant.
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      isActive: draft.isActive,
      isFeatured: draft.isFeatured,
      displayOrder: Number(draft.displayOrder) || 0,
    };

    try {
      if (editingId) {
        await api.patch(`/admin/collections/${editingId}`, payload);
        notify(`${payload.name} updated`);
      } else {
        await api.post("/admin/collections", payload);
        notify(`${payload.name} created`);
      }
      cancel();
      await reload();
    } catch (caught) {
      setFormError(
        caught instanceof AdminApiError ? caught.message : "Could not save that collection.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (collection: Collection) => {
    if (!window.confirm(`Delete "${collection.name}"? Products are not deleted.`)) return;

    try {
      await api.delete(`/admin/collections/${collection._id}`);
      notify(`${collection.name} deleted`);
      await reload();
    } catch (caught) {
      notify(caught instanceof AdminApiError ? caught.message : "Could not delete that collection.");
    }
  };

  const toggleProduct = (id: string) =>
    setDraft((current) => ({
      ...current,
      productIds: current.productIds.includes(id)
        ? current.productIds.filter((entry) => entry !== id)
        : [...current.productIds, id],
    }));

  const editor = (
    <div className="variant-card">
      <div className="field-grid">
        <label className="field">
          <span>
            Name <b>*</b>
          </span>
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Bridal Edit"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Display order</span>
          <input
            value={draft.displayOrder}
            onChange={(event) => setDraft({ ...draft, displayOrder: event.target.value })}
            inputMode="numeric"
          />
        </label>
        <label className="field field-wide">
          <span>Description</span>
          <textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            rows={2}
            placeholder="Heirloom pieces for the wedding day."
          />
        </label>
        <label className="field">
          <span>Starts</span>
          <input
            type="datetime-local"
            value={draft.startsAt}
            onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
          />
          <small>Leave blank to start immediately</small>
        </label>
        <label className="field">
          <span>Ends</span>
          <input
            type="datetime-local"
            value={draft.endsAt}
            onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
          />
          <small>Leave blank to run indefinitely</small>
        </label>
      </div>

      <div className="field" style={{ marginTop: 15 }}>
        <span>Products in this collection ({draft.productIds.length})</span>
        <div className="chip-row">
          {products.length === 0 ? (
            <small>No products to add yet.</small>
          ) : (
            products.map((product) => (
              <button
                type="button"
                key={product._id}
                className={`chip ${draft.productIds.includes(product._id) ? "chip-selected" : ""}`}
                onClick={() => toggleProduct(product._id)}
              >
                {draft.productIds.includes(product._id) && <Check />}
                {product.title}
              </button>
            ))
          )}
        </div>
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
        />
        <span>
          <strong>Active</strong>
          <small>Turn off to hide without deleting.</small>
        </span>
      </label>

      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.isFeatured}
          onChange={(event) => setDraft({ ...draft, isFeatured: event.target.checked })}
        />
        <span>
          <strong>Featured</strong>
          <small>Surfaced on the storefront homepage.</small>
        </span>
      </label>

      <div className="editor-footer" style={{ paddingTop: 14 }}>
        <button className="secondary-button" onClick={cancel} type="button">
          Cancel
        </button>
        <button className="primary-button" onClick={save} disabled={saving} type="button">
          {saving ? <Loader2 className="spin" /> : <Check />}
          {saving ? "Saving…" : "Save collection"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeading
        eyebrow="Merchandising"
        title="Collections"
        description="Time-boxed campaigns that group products for a season or occasion."
        action="Add collection"
        onAction={() => {
          setEditingId(null);
          setCreating(true);
          setDraft(emptyDraft);
        }}
        actionIcon={Plus}
      />

      {error && <ErrorRow message={error} onRetry={reload} />}

      <div className="panel list-panel">
        <Toolbar count={collections.length} />

        {creating && editor}

        {loading ? (
          <TreeSkeleton label="Loading collections…" />
        ) : /* A failed load must not be reported as "No collections yet". A failed
               *save* is unrelated to whether the list is empty, so only the load
               error suppresses it. */
        loadError ? null : collections.length === 0 && !creating ? (
          <EmptyRow
            title="No collections yet"
            description="Group products into a seasonal edit — Bridal, Festival, Daily Wear."
          />
        ) : (
          <div className="tree-list">
            {collections.map((collection) => (
              <div key={collection._id}>
                <div className="tree-row">
                  <div className="tree-row-main">
                    <div>
                      <strong>{collection.name}</strong>
                      <small>
                        /{collection.slug}
                        {collection.endsAt &&
                          ` · ends ${new Date(collection.endsAt).toLocaleDateString("en-IN")}`}
                      </small>
                    </div>
                  </div>
                  <span className="tree-count">
                    {number(collection.productIds?.length ?? 0)} products
                  </span>
                  {collection.isFeatured && <StatusBadge label="Featured" tone="shipped" />}
                  <StatusBadge
                    label={isLive(collection) ? "Live" : collection.isActive ? "Scheduled" : "Off"}
                    tone={isLive(collection) ? "stock" : "low"}
                  />
                  <div className="tree-actions">
                    <button
                      className="row-action"
                      onClick={() => startEdit(collection)}
                      aria-label={`Edit ${collection.name}`}
                    >
                      <Pencil />
                    </button>
                    <button
                      className="row-action"
                      onClick={() => remove(collection)}
                      aria-label={`Delete ${collection.name}`}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
                {editingId === collection._id && editor}
              </div>
            ))}
          </div>
        )}
      </div>

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load collections"
        message={loadError}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
