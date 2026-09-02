"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import { api, AdminApiError, type PolicyContent, type PolicySection } from "@/app/admin/_lib/api";
import { EmptyRow, ErrorDialog, ErrorRow, PageHeading, TreeSkeleton } from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/**
 * Shipping and returns policy copy — the body text customers read at
 * `/policies/shipping` and `/policies/returns` on the storefront.
 *
 * Each section's body is edited as one paragraph per line: a textarea, split
 * on newlines, rather than a repeating field per paragraph. Policies run to a
 * handful of short paragraphs per section, and a plain textarea is far less
 * to build and to use than nested add/remove rows for what is, in practice,
 * just prose.
 */

type SectionDraft = { heading: string; bodyText: string };
type Draft = { title: string; intro: string; sections: SectionDraft[] };

function toDraft(policy: PolicyContent): Draft {
  return {
    title: policy.title,
    intro: policy.intro,
    sections: policy.sections.map((section) => ({
      heading: section.heading,
      bodyText: section.body.join("\n"),
    })),
  };
}

function toSections(sections: SectionDraft[]): PolicySection[] {
  return sections
    .map((section) => ({
      heading: section.heading.trim(),
      body: section.bodyText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    }))
    .filter((section) => section.heading && section.body.length > 0);
}

export default function PoliciesPage() {
  const { notify } = useToast();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useAsyncData(
    async () => (await api.get<PolicyContent[]>("/admin/policies")).data,
    [],
    { errorMessage: "Could not load the policies." },
  );

  const policyList = data ?? [];
  const errorDialog = useErrorDialog(loadError, reload);

  const startEdit = (policy: PolicyContent) => {
    setEditingSlug(policy.slug);
    setDraft(toDraft(policy));
    setFormError("");
  };

  const cancel = () => {
    setEditingSlug(null);
    setDraft(null);
    setFormError("");
  };

  const updateSection = (index: number, patch: Partial<SectionDraft>) => {
    setDraft((current) => {
      if (!current) return current;
      const sections = current.sections.map((section, i) => (i === index ? { ...section, ...patch } : section));
      return { ...current, sections };
    });
  };

  const addSection = () => {
    setDraft((current) =>
      current ? { ...current, sections: [...current.sections, { heading: "", bodyText: "" }] } : current,
    );
  };

  const removeSection = (index: number) => {
    setDraft((current) =>
      current ? { ...current, sections: current.sections.filter((_, i) => i !== index) } : current,
    );
  };

  const save = async () => {
    if (!draft || !editingSlug) return;

    if (!draft.title.trim()) return setFormError("Give the policy a title.");
    if (!draft.intro.trim()) return setFormError("Add an introduction.");

    const sections = toSections(draft.sections);
    if (sections.length === 0) return setFormError("Add at least one section with a heading and body text.");

    setSaving(true);
    setFormError("");

    try {
      await api.patch(`/admin/policies/${editingSlug}`, {
        title: draft.title.trim(),
        intro: draft.intro.trim(),
        sections,
      });
      notify("Policy updated");
      cancel();
      await reload();
    } catch (caught) {
      setFormError(caught instanceof AdminApiError ? caught.message : "Could not save that policy.");
    } finally {
      setSaving(false);
    }
  };

  const editor = draft && (
    <div className="variant-card">
      <div className="field-grid">
        <label className="field">
          <span>
            Title <b>*</b>
          </span>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
        </label>
      </div>

      <label className="field" style={{ marginTop: 14 }}>
        <span>
          Introduction <b>*</b>
        </span>
        <textarea
          value={draft.intro}
          onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
          rows={3}
        />
      </label>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {draft.sections.map((section, index) => (
          <div key={index} className="form-card">
            <div className="form-card-heading">
              <div style={{ flex: 1 }}>
                <label className="field">
                  <span>Section heading</span>
                  <input
                    value={section.heading}
                    onChange={(e) => updateSection(index, { heading: e.target.value })}
                    placeholder="Dispatch times"
                  />
                </label>
              </div>
              <button
                className="row-action"
                onClick={() => removeSection(index)}
                aria-label={`Remove section ${index + 1}`}
                type="button"
              >
                <Trash2 />
              </button>
            </div>
            <label className="field">
              <span>Body — one paragraph per line</span>
              <textarea
                value={section.bodyText}
                onChange={(e) => updateSection(index, { bodyText: e.target.value })}
                rows={4}
              />
            </label>
          </div>
        ))}

        <button className="secondary-button" onClick={addSection} type="button" style={{ alignSelf: "flex-start" }}>
          <Plus />
          Add section
        </button>
      </div>

      <div className="editor-footer" style={{ paddingTop: 14 }}>
        <button className="secondary-button" onClick={cancel} type="button">
          Cancel
        </button>
        <button className="primary-button" onClick={save} disabled={saving} type="button">
          {saving ? <Loader2 className="spin" /> : <Check />}
          {saving ? "Saving…" : "Save policy"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeading
        eyebrow="Storefront"
        title="Policies"
        description="Shipping and returns copy shown at /policies on the storefront."
      />

      {formError && <ErrorRow message={formError} />}

      <div className="panel list-panel">
        {loading ? (
          <TreeSkeleton label="Loading policies…" rows={2} />
        ) : loadError ? null : policyList.length === 0 ? (
          <EmptyRow title="No policies yet" description="They appear here once the storefront reads them." />
        ) : (
          <div className="tree-list">
            {policyList.map((policy) => (
              <div key={policy.slug}>
                <div className="tree-row">
                  <div className="tree-row-main">
                    <div>
                      <strong>{policy.title}</strong>
                      <small>{policy.sections.length} sections</small>
                    </div>
                  </div>
                  <div className="tree-actions">
                    <button
                      className="row-action"
                      onClick={() => startEdit(policy)}
                      aria-label={`Edit ${policy.title}`}
                    >
                      <Pencil />
                    </button>
                  </div>
                </div>
                {editingSlug === policy.slug && editor}
              </div>
            ))}
          </div>
        )}
      </div>

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load the policies"
        message={loadError}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
