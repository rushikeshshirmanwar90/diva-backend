"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  api,
  AdminApiError,
  type FaqGroup,
  type PolicyContent,
  type PolicySection,
  type StoreSettings,
} from "@/app/admin/_lib/api";
import { DEFAULT_FAQS } from "@/app/admin/_lib/faq-defaults";
import { EmptyRow, ErrorDialog, ErrorRow, PageHeading, TreeSkeleton } from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/**
 * Two things customers read for answers, on one screen.
 *
 * The **policies** — the body text at `/policies/shipping`, `/returns`,
 * `/privacy` and `/terms` — and the **FAQ** — the question groups on `/faq`.
 * They are edited by the same person for the same reason, so they live on
 * the same page; the FAQ's page header and help cards, which are layout
 * rather than answers, stay under Settings → Help Page.
 *
 * Policies are each their own document with their own endpoint. The FAQ is
 * one ordered list stored on the store settings, so every FAQ change saves
 * the whole list through `PATCH /admin/settings` — a group edit, a delete
 * and a reorder are all "here is the new list".
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

  // ---------------------------------------------------------------------------
  // FAQ
  // ---------------------------------------------------------------------------

  const {
    data: settings,
    loading: faqLoading,
    error: faqLoadError,
    reload: reloadFaq,
  } = useAsyncData(
    async () => (await api.get<StoreSettings>("/admin/settings")).data,
    [],
    { errorMessage: "Could not load the FAQ." },
  );

  /**
   * An empty saved list means the storefront is showing its built-in
   * questions, so that is what the editor shows too — otherwise the admin
   * sees "no questions" while the site plainly has some.
   */
  const faqGroups: FaqGroup[] = settings?.faqs?.length ? settings.faqs : DEFAULT_FAQS;

  const [editingGroup, setEditingGroup] = useState<number | "new" | null>(null);
  const [groupDraft, setGroupDraft] = useState<FaqGroup | null>(null);
  const [faqSaving, setFaqSaving] = useState(false);
  const [faqError, setFaqError] = useState("");

  const startEditGroup = (index: number) => {
    const group = faqGroups[index];
    if (!group) return;
    setEditingGroup(index);
    setGroupDraft({ group: group.group, items: group.items.map((item) => ({ ...item })) });
    setFaqError("");
  };

  const startNewGroup = () => {
    setEditingGroup("new");
    setGroupDraft({ group: "", items: [{ q: "", a: "" }] });
    setFaqError("");
  };

  const cancelGroup = () => {
    setEditingGroup(null);
    setGroupDraft(null);
    setFaqError("");
  };

  const updateItem = (index: number, patch: Partial<FaqGroup["items"][number]>) =>
    setGroupDraft((current) =>
      current
        ? { ...current, items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }
        : current,
    );

  const addItem = () =>
    setGroupDraft((current) => (current ? { ...current, items: [...current.items, { q: "", a: "" }] } : current));

  const removeItem = (index: number) =>
    setGroupDraft((current) =>
      current ? { ...current, items: current.items.filter((_, i) => i !== index) } : current,
    );

  const moveItem = (index: number, direction: -1 | 1) =>
    setGroupDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.items.length) return current;
      const items = [...current.items];
      [items[index], items[target]] = [items[target]!, items[index]!];
      return { ...current, items };
    });

  /** Writes the whole list; the server validates every group and question. */
  const persistFaq = async (next: FaqGroup[], message: string) => {
    setFaqSaving(true);
    setFaqError("");
    try {
      await api.patch("/admin/settings", { faqs: next });
      notify(message);
      cancelGroup();
      await reloadFaq();
      return true;
    } catch (caught) {
      setFaqError(caught instanceof AdminApiError ? caught.message : "Could not save the FAQ.");
      return false;
    } finally {
      setFaqSaving(false);
    }
  };

  const saveGroup = async () => {
    if (!groupDraft || editingGroup === null) return;

    const cleaned: FaqGroup = {
      group: groupDraft.group.trim(),
      items: groupDraft.items
        .map((item) => ({ q: item.q.trim(), a: item.a.trim() }))
        .filter((item) => item.q || item.a),
    };

    if (!cleaned.group) return setFaqError("Give the category a name.");
    if (cleaned.items.length === 0) return setFaqError("Add at least one question.");
    const incomplete = cleaned.items.findIndex((item) => !item.q || !item.a);
    if (incomplete !== -1) return setFaqError(`Question #${incomplete + 1} needs both a question and an answer.`);

    const next =
      editingGroup === "new"
        ? [...faqGroups, cleaned]
        : faqGroups.map((group, i) => (i === editingGroup ? cleaned : group));

    await persistFaq(next, editingGroup === "new" ? "FAQ category added" : "FAQ category updated");
  };

  const removeGroup = async (index: number) => {
    const group = faqGroups[index];
    if (!group) return;
    if (!window.confirm(`Delete "${group.group}" and its ${group.items.length} question${group.items.length === 1 ? "" : "s"}?`)) return;
    await persistFaq(faqGroups.filter((_, i) => i !== index), "FAQ category deleted");
  };

  const moveGroup = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= faqGroups.length) return;
    const next = [...faqGroups];
    [next[index], next[target]] = [next[target]!, next[index]!];
    await persistFaq(next, "FAQ order updated");
  };

  const restoreDefaultFaq = async () => {
    if (!window.confirm("Replace every FAQ category with the store defaults?")) return;
    await persistFaq(DEFAULT_FAQS, "FAQ restored to defaults");
  };

  const groupEditor = groupDraft && (
    <div className="variant-card">
      <div className="field-grid">
        <label className="field">
          <span>
            Category name <b>*</b>
          </span>
          <input
            value={groupDraft.group}
            onChange={(e) => setGroupDraft({ ...groupDraft, group: e.target.value })}
            placeholder="Orders & Delivery"
            maxLength={80}
            autoFocus
          />
        </label>
      </div>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {groupDraft.items.map((item, index) => (
          <div key={index} className="form-card">
            <div className="form-card-heading">
              <div style={{ flex: 1 }}>
                <label className="field">
                  <span>Question {index + 1}</span>
                  <input
                    value={item.q}
                    onChange={(e) => updateItem(index, { q: e.target.value })}
                    placeholder="How long does delivery take?"
                    maxLength={300}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  className="row-action"
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move question ${index + 1} up`}
                  type="button"
                >
                  <ArrowUp />
                </button>
                <button
                  className="row-action"
                  onClick={() => moveItem(index, 1)}
                  disabled={index === groupDraft.items.length - 1}
                  aria-label={`Move question ${index + 1} down`}
                  type="button"
                >
                  <ArrowDown />
                </button>
                <button
                  className="row-action"
                  onClick={() => removeItem(index)}
                  aria-label={`Remove question ${index + 1}`}
                  type="button"
                >
                  <Trash2 />
                </button>
              </div>
            </div>
            <label className="field">
              <span>Answer</span>
              <textarea
                value={item.a}
                onChange={(e) => updateItem(index, { a: e.target.value })}
                rows={3}
                maxLength={2000}
              />
            </label>
          </div>
        ))}

        <button className="secondary-button" onClick={addItem} type="button" style={{ alignSelf: "flex-start" }}>
          <Plus />
          Add question
        </button>
      </div>

      <div className="editor-footer" style={{ paddingTop: 14 }}>
        <button className="secondary-button" onClick={cancelGroup} type="button" disabled={faqSaving}>
          Cancel
        </button>
        <button className="primary-button" onClick={() => void saveGroup()} disabled={faqSaving} type="button">
          {faqSaving ? <Loader2 className="spin" /> : <Check />}
          {faqSaving ? "Saving…" : editingGroup === "new" ? "Add category" : "Save category"}
        </button>
      </div>
    </div>
  );

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
        title="Policies & FAQ"
        description="Policy pages at /policies, and the questions answered at /faq."
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

      <section className="panel list-panel" style={{ marginTop: 18 }}>
        <div className="panel-heading" style={{ marginBottom: 14 }}>
          <div>
            <h2>Frequently asked questions</h2>
            <p>Grouped by category, in the order shown on /faq</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="secondary-button"
              onClick={() => void restoreDefaultFaq()}
              type="button"
              disabled={faqSaving}
            >
              <RotateCcw />
              Restore defaults
            </button>
            <button
              className="primary-button"
              onClick={startNewGroup}
              type="button"
              disabled={faqSaving || editingGroup !== null}
            >
              <Plus />
              Add category
            </button>
          </div>
        </div>

        {faqError && <ErrorRow message={faqError} />}

        {editingGroup === "new" && groupEditor}

        {faqLoading && !settings ? (
          <TreeSkeleton label="Loading questions…" rows={3} />
        ) : faqLoadError ? (
          <ErrorRow message={faqLoadError} onRetry={reloadFaq} />
        ) : faqGroups.length === 0 && editingGroup !== "new" ? (
          <EmptyRow
            title="No questions yet"
            description="Add a category, then the questions customers ask under it."
          />
        ) : (
          <div className="tree-list">
            {faqGroups.map((group, index) => (
              <div key={`${group.group}-${index}`}>
                <div className="tree-row">
                  <div className="tree-row-main">
                    <div>
                      <strong>{group.group}</strong>
                      <small>
                        {group.items.length} {group.items.length === 1 ? "question" : "questions"}
                        {group.items[0] ? ` · ${group.items[0].q}` : ""}
                      </small>
                    </div>
                  </div>
                  <div className="tree-actions">
                    <button
                      className="row-action"
                      onClick={() => void moveGroup(index, -1)}
                      disabled={index === 0 || faqSaving}
                      aria-label={`Move ${group.group} up`}
                    >
                      <ArrowUp />
                    </button>
                    <button
                      className="row-action"
                      onClick={() => void moveGroup(index, 1)}
                      disabled={index === faqGroups.length - 1 || faqSaving}
                      aria-label={`Move ${group.group} down`}
                    >
                      <ArrowDown />
                    </button>
                    <button
                      className="row-action"
                      onClick={() => startEditGroup(index)}
                      disabled={faqSaving}
                      aria-label={`Edit ${group.group}`}
                    >
                      <Pencil />
                    </button>
                    <button
                      className="row-action"
                      onClick={() => void removeGroup(index)}
                      disabled={faqSaving}
                      aria-label={`Delete ${group.group}`}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
                {editingGroup === index && groupEditor}
              </div>
            ))}
          </div>
        )}
      </section>

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
