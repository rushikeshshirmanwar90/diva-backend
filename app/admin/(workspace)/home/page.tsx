"use client";

import { useState } from "react";
import { Check, GripVertical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import { api, AdminApiError, type HeroSlide, type ProductImage } from "@/app/admin/_lib/api";
import { HERO_LINK_OPTIONS, type HeroLinkHref } from "@/lib/hero-links";
import {
  EmptyRow,
  ErrorDialog,
  ErrorRow,
  PageHeading,
  StatusBadge,
  Toolbar,
  TreeSkeleton,
} from "@/app/admin/_components/ui";
import { ImageField } from "@/app/admin/_components/image-upload";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/**
 * The homepage hero — the rotating banner at the top of the storefront.
 *
 * Four fields, deliberately: a title, a subtitle, a button label and where
 * the button goes. The button's destination is a dropdown of the
 * storefront's own sections (`HERO_LINK_OPTIONS`), not a free-text URL — a
 * slide can never link off-site or at a mistyped route.
 *
 * `displayOrder` is a plain number an admin types in, not a drag-and-drop
 * list. Fewer than a handful of slides typically exist at once, and the
 * field on the editor already does the job without dragging state, a
 * reorder endpoint, and the bugs both invite.
 */

type Draft = {
  heading: string;
  subtitle: string;
  image: ProductImage | null;
  ctaLabel: string;
  ctaHref: HeroLinkHref;
  displayOrder: string;
  isActive: boolean;
};

const emptyDraft: Draft = {
  heading: "",
  subtitle: "",
  image: null,
  ctaLabel: "",
  ctaHref: HERO_LINK_OPTIONS[0].href,
  displayOrder: "0",
  isActive: true,
};

export default function HomePage() {
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
    async () => (await api.get<HeroSlide[]>("/admin/hero-slides")).data,
    [],
    { errorMessage: "Could not load the hero slides." },
  );

  const slides = data ?? [];
  const error = formError || loadError;
  const errorDialog = useErrorDialog(loadError, reload);

  const cancel = () => {
    setEditingId(null);
    setCreating(false);
    setDraft(emptyDraft);
    setFormError("");
  };

  const startEdit = (slide: HeroSlide) => {
    setCreating(false);
    setEditingId(slide._id);
    setDraft({
      heading: slide.heading,
      subtitle: slide.subtitle,
      image: slide.image,
      ctaLabel: slide.cta.label,
      ctaHref: slide.cta.href as HeroLinkHref,
      displayOrder: String(slide.displayOrder),
      isActive: slide.isActive,
    });
  };

  const save = async () => {
    if (!draft.heading.trim()) {
      setFormError("Give the slide a title.");
      return;
    }
    if (!draft.subtitle.trim()) {
      setFormError("Give the slide a subtitle.");
      return;
    }
    if (!draft.image) {
      setFormError("Upload a background image.");
      return;
    }
    if (!draft.ctaLabel.trim()) {
      setFormError("Give the button a label.");
      return;
    }

    setSaving(true);
    setFormError("");

    const payload = {
      heading: draft.heading.trim(),
      subtitle: draft.subtitle.trim(),
      image: draft.image,
      cta: { label: draft.ctaLabel.trim(), href: draft.ctaHref },
      displayOrder: Number(draft.displayOrder) || 0,
      isActive: draft.isActive,
    };

    try {
      if (editingId) {
        await api.patch(`/admin/hero-slides/${editingId}`, payload);
        notify("Slide updated");
      } else {
        await api.post("/admin/hero-slides", payload);
        notify("Slide added");
      }
      cancel();
      await reload();
    } catch (caught) {
      setFormError(caught instanceof AdminApiError ? caught.message : "Could not save that slide.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (slide: HeroSlide) => {
    if (!window.confirm(`Delete the "${slide.heading}" slide?`)) return;

    try {
      await api.delete(`/admin/hero-slides/${slide._id}`);
      notify("Slide deleted");
      await reload();
    } catch (caught) {
      notify(caught instanceof AdminApiError ? caught.message : "Could not delete that slide.");
    }
  };

  const editor = (
    <div className="variant-card">
      <div className="field-grid">
        <label className="field">
          <span>
            Title <b>*</b>
          </span>
          <input
            value={draft.heading}
            onChange={(event) => setDraft({ ...draft, heading: event.target.value })}
            placeholder="Gold that outlives the occasion"
            autoFocus
          />
        </label>
        <label className="field">
          <span>
            Subtitle <b>*</b>
          </span>
          <input
            value={draft.subtitle}
            onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
            placeholder="Hallmarked 22K and 18K jewellery, made in Bengaluru and Jaipur."
          />
        </label>
        <label className="field">
          <span>
            Button <b>*</b>
          </span>
          <input
            value={draft.ctaLabel}
            onChange={(event) => setDraft({ ...draft, ctaLabel: event.target.value })}
            placeholder="Shop the collection"
          />
        </label>
        <label className="field">
          <span>
            Link <b>*</b>
          </span>
          <select
            value={draft.ctaHref}
            onChange={(event) =>
              setDraft({ ...draft, ctaHref: event.target.value as HeroLinkHref })
            }
          >
            {HERO_LINK_OPTIONS.map((option) => (
              <option key={option.href} value={option.href}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Display order</span>
          <input
            value={draft.displayOrder}
            onChange={(event) => setDraft({ ...draft, displayOrder: event.target.value })}
            inputMode="numeric"
          />
          <small>Lower numbers show first.</small>
        </label>
      </div>

      <div style={{ marginTop: 15 }}>
        <ImageField
          label="Background image"
          hint="Full-bleed, at least 1600px wide — it fills the whole hero."
          folder="banner"
          altFallback={draft.heading}
          value={draft.image}
          onChange={(image) => setDraft({ ...draft, image })}
          onError={(message) => setFormError(message)}
        />
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
        />
        <span>
          <strong>Active</strong>
          <small>Turn off to hide from the storefront without deleting it.</small>
        </span>
      </label>

      <div className="editor-footer" style={{ paddingTop: 14 }}>
        <button className="secondary-button" onClick={cancel} type="button">
          Cancel
        </button>
        <button className="primary-button" onClick={save} disabled={saving} type="button">
          {saving ? <Loader2 className="spin" /> : <Check />}
          {saving ? "Saving…" : "Save slide"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeading
        eyebrow="Storefront"
        title="Home"
        description="The rotating hero banner at the top of the homepage."
        action="Add slide"
        onAction={() => {
          setEditingId(null);
          setCreating(true);
          setDraft(emptyDraft);
        }}
        actionIcon={Plus}
      />

      {error && <ErrorRow message={error} onRetry={reload} />}

      <div className="panel list-panel">
        <Toolbar count={slides.length} />

        {creating && editor}

        {loading ? (
          <TreeSkeleton label="Loading slides…" />
        ) : loadError ? null : slides.length === 0 && !creating ? (
          <EmptyRow
            title="No hero slides yet"
            description="Add one to replace the storefront's default banner."
          />
        ) : (
          <div className="tree-list">
            {slides.map((slide) => (
              <div key={slide._id}>
                <div className="tree-row">
                  <GripVertical style={{ opacity: 0.35 }} />
                  <div className="tree-row-main">
                    <div>
                      <strong>{slide.heading}</strong>
                      <small>
                        {slide.subtitle} · order {slide.displayOrder}
                      </small>
                    </div>
                  </div>
                  <StatusBadge
                    label={slide.isActive ? "Active" : "Off"}
                    tone={slide.isActive ? "stock" : "low"}
                  />
                  <div className="tree-actions">
                    <button
                      className="row-action"
                      onClick={() => startEdit(slide)}
                      aria-label={`Edit ${slide.heading}`}
                    >
                      <Pencil />
                    </button>
                    <button
                      className="row-action"
                      onClick={() => void remove(slide)}
                      aria-label={`Delete ${slide.heading}`}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
                {editingId === slide._id && editor}
              </div>
            ))}
          </div>
        )}
      </div>

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load the hero slides"
        message={loadError}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
