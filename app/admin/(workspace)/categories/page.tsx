"use client";

import { useState } from "react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import { Check, Image as ImageIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api, AdminApiError, type CategoryNode, type ProductImage } from "@/app/admin/_lib/api";
import { ImageField } from "@/app/admin/_components/image-upload";
import { number } from "@/app/admin/_lib/format";
import {
  EmptyRow,
  ErrorDialog,
  ErrorRow,
  PageHeading,
  StatusBadge,
  TreeSkeleton,
} from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/**
 * Categories.
 *
 * A tree, not a flat list — the API still models parent/child, so any nesting
 * created earlier keeps rendering nested. The form, though, is deliberately
 * three fields: a name and two images. Everything else the API accepts
 * (parent, display order, icon, active, featured) keeps its server-side
 * default, and an edit simply omits those keys so existing values survive.
 *
 * Editing happens inline rather than on a separate page — a full navigation for
 * three fields is more ceremony than the task deserves.
 */

type Draft = {
  name: string;
  image: ProductImage | null;
  bannerImage: ProductImage | null;
};

const emptyDraft: Draft = {
  name: "",
  image: null,
  bannerImage: null,
};

export default function CategoriesPage() {
  const { notify } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  /**
   * Server-side field errors, keyed by the dotted path the API returns.
   *
   * Without these the form could only show "The submitted data is invalid",
   * which names no field and leaves an admin re-reading a two-field form
   * wondering what it objected to.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useAsyncData(
    async () => {
      const response = await api.get<CategoryNode[]>("/categories/tree");
      return response.data;
    },
    [],
    { errorMessage: "Could not load categories." },
  );

  const tree = data ?? [];

  const error = formError || loadError;

  /**
   * Bound to `loadError`, not to the combined `error`.
   *
   * The dialog's only action is "Try again", which calls `reload()` — and
   * reloading the list does nothing for a *save* that failed. A form error
   * belongs beside the form it came from, where the fix is to change a field
   * and submit again.
   */
  const errorDialog = useErrorDialog(loadError, reload);

  const startEdit = (category: CategoryNode) => {
    setCreating(false);
    setEditingId(category._id);
    setDraft({
      name: category.name,
      image: category.image ?? null,
      bannerImage: category.bannerImage ?? null,
    });
  };

  const cancel = () => {
    setEditingId(null);
    setCreating(false);
    setDraft(emptyDraft);
    setFormError("");
    setFieldErrors({});
  };

  const save = async () => {
    // Checked here as well as on the server so the common mistake gets an
    // answer without a round trip. The server's `min(2)` is the real rule.
    if (draft.name.trim().length < 2) {
      setFormError("Give the category a name of at least 2 characters.");
      return;
    }

    setSaving(true);
    setFormError("");
    setFieldErrors({});

    // Only the three fields the form owns. The others are left out entirely
    // rather than sent as defaults — on an edit, an absent key means "leave it
    // alone", so a category that was hidden or re-parented elsewhere stays that
    // way. On a create the validator fills in its own defaults.
    const payload = {
      name: draft.name.trim(),
      // Explicit null rather than undefined: on an edit that is what clears an
      // image the user removed. Both image fields are nullable in the validator
      // for exactly this reason.
      image: draft.image,
      bannerImage: draft.bannerImage,
    };

    try {
      if (editingId) {
        await api.patch(`/admin/categories/${editingId}`, payload);
        notify(`${payload.name} updated`);
      } else {
        await api.post("/admin/categories", payload);
        notify(`${payload.name} created`);
      }
      cancel();
      await reload();
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        setFormError(caught.message);
        // Dotted paths (`name`, `image.url`) placed beside the input that
        // caused them, rather than left in a generic banner.
        setFieldErrors(
          Object.fromEntries(caught.details.map((detail) => [detail.path, detail.message])),
        );
      } else {
        setFormError("Could not save that category.");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category: CategoryNode) => {
    if (!window.confirm(`Delete "${category.name}"?`)) return;

    try {
      await api.delete(`/admin/categories/${category._id}`);
      notify(`${category.name} deleted`);
      await reload();
    } catch (caught) {
      // The API refuses to delete a category that still holds products or
      // sub-categories, and its message says which — surface it verbatim.
      notify(caught instanceof AdminApiError ? caught.message : "Could not delete that category.");
    }
  };

  const editor = (
    <div className="variant-card">
      <div className="field-grid">
        {/* `field-wide` so the lone field spans the grid's two columns. */}
        <label className="field field-wide">
          <span>
            Category name <b>*</b>
          </span>
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Engagement Rings"
            autoFocus
            className={fieldErrors.name ? "has-error" : ""}
          />
          {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
        </label>
      </div>

      <ImageField
        label="Category image"
        hint="JPG, PNG or WebP, any size — oversized files are compressed in your browser. Shown on the homepage grid, so a square-ish crop reads best."
        folder="category"
        altFallback={draft.name}
        value={draft.image}
        onChange={(image) => setDraft((current) => ({ ...current, image }))}
        onError={setFormError}
      />

      <ImageField
        label="Banner image"
        hint="The wide hero across the top of the category landing page. A landscape crop — roughly 3:1 — survives the page's own cropping best."
        folder="banner"
        altFallback={draft.name}
        value={draft.bannerImage}
        onChange={(bannerImage) => setDraft((current) => ({ ...current, bannerImage }))}
        onError={setFormError}
      />

      <div className="editor-footer" style={{ paddingTop: 14 }}>
        <button className="secondary-button" onClick={cancel} type="button">
          Cancel
        </button>
        <button className="primary-button" onClick={save} disabled={saving} type="button">
          {saving ? <Loader2 className="spin" /> : <Check />}
          {saving ? "Saving…" : "Save category"}
        </button>
      </div>
    </div>
  );

  const renderRow = (category: CategoryNode, depth = 0) => (
    <div key={category._id}>
      <div className={`tree-row ${depth > 0 ? "tree-child" : ""}`}>
        <div className="tree-row-main">
          {category.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="tree-thumb" src={category.image.url} alt="" />
          ) : (
            <span className="tree-thumb tree-thumb-empty" aria-hidden="true">
              <ImageIcon />
            </span>
          )}
          <div>
            <strong>{category.name}</strong>
            <small>/{category.slug}</small>
          </div>
        </div>
        <span className="tree-count">{number(category.productCount)} products</span>
        {category.isFeatured && <StatusBadge label="Featured" tone="shipped" />}
        <StatusBadge
          label={category.isActive ? "Active" : "Hidden"}
          tone={category.isActive ? "stock" : "low"}
        />
        <div className="tree-actions">
          <button
            className="row-action"
            onClick={() => startEdit(category)}
            aria-label={`Edit ${category.name}`}
          >
            <Pencil />
          </button>
          <button
            className="row-action"
            onClick={() => remove(category)}
            aria-label={`Delete ${category.name}`}
          >
            <Trash2 />
          </button>
        </div>
      </div>

      {editingId === category._id && editor}
      {category.children.map((child) => renderRow(child, depth + 1))}
    </div>
  );

  return (
    <>
      <PageHeading
        eyebrow="Catalog"
        title="Categories"
        description="The tree your storefront navigation is built from."
        action="Add category"
        onAction={() => {
          setEditingId(null);
          setCreating(true);
          setDraft(emptyDraft);
        }}
        actionIcon={Plus}
      />

      {error && <ErrorRow message={error} onRetry={reload} />}

      <div className="panel list-panel">
        {creating && editor}

        {loading ? (
          <TreeSkeleton label="Loading categories…" />
        ) : /* A failed load must not be reported as "No categories yet". A failed
               *save* is unrelated to whether the list is empty, so only the load
               error suppresses it. */
        loadError ? null : tree.length === 0 && !creating ? (
          <EmptyRow
            title="No categories yet"
            description="Categories organise your catalogue and drive storefront navigation."
          />
        ) : (
          <div className="tree-list">{tree.map((category) => renderRow(category))}</div>
        )}
      </div>

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load categories"
        message={loadError}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
