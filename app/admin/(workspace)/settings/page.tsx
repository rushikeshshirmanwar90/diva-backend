"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  api,
  AdminApiError,
  type HelpCard,
  type HelpLink,
  type StoreSettings,
} from "@/app/admin/_lib/api";
import { EditorSkeleton, ErrorDialog, ErrorRow, PageHeading } from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/** Mirrors the schema default in `models/Setting.ts`, for "Restore defaults". */
const DEFAULT_HELP_LINKS: HelpLink[] = [
  { label: "FAQ", href: "/faq", isActive: true, openInNewTab: false },
  { label: "Shipping", href: "/policies/shipping", isActive: true, openInNewTab: false },
  { label: "Returns & exchange", href: "/policies/returns", isActive: true, openInNewTab: false },
  { label: "Privacy policy", href: "/policies/privacy", isActive: true, openInNewTab: false },
  { label: "Terms of service", href: "/policies/terms", isActive: true, openInNewTab: false },
  { label: "My account", href: "/account", isActive: true, openInNewTab: false },
];

/** Mirrors `DEFAULT_HELP_CARDS` in `models/Setting.ts`. */
const DEFAULT_HELP_CARDS: HelpCard[] = [
  {
    title: "Track an order",
    body: "See where your order is, download invoices and request a return from your account.",
    href: "/account/orders",
    cta: "My orders",
  },
  {
    title: "Planning a wedding?",
    body: "Bridal orders take 6–8 weeks. Here is the timeline we recommend.",
    href: "/blog/bridal-timeline-eight-weeks",
    cta: "Read the guide",
  },
];

/** Same rule as the backend validator: a storefront path, or a full http(s) URL. */
function isValidHref(value: string): boolean {
  return /^\/(?!\/)[^\s]*$/.test(value) || /^https?:\/\/[^\s]+$/i.test(value);
}

type Draft = {
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  supportHours: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  instagram: string;
  facebook: string;
  youtube: string;
  pinterest: string;
  footerBlurb: string;
  copyrightText: string;
  paymentMethodsNote: string;
  helpLinks: HelpLink[];
  helpEyebrow: string;
  helpTitle: string;
  helpDescription: string;
  helpCards: HelpCard[];
};

function toDraft(settings: StoreSettings): Draft {
  const address = settings.address || {};
  const social = settings.social || {};

  return {
    storeName: settings.storeName ?? "",
    supportEmail: settings.supportEmail ?? "",
    supportPhone: settings.supportPhone ?? "",
    whatsappNumber: settings.whatsappNumber ?? "",
    supportHours: settings.supportHours || "Mon–Sat, 9:00–21:00 IST",
    addressLine1: address.line1 ?? "",
    addressLine2: address.line2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    pincode: address.pincode ?? "",
    country: address.country ?? "India",
    instagram: social.instagram ?? "",
    facebook: social.facebook ?? "",
    youtube: social.youtube ?? "",
    pinterest: social.pinterest ?? "",
    footerBlurb:
      settings.footerBlurb ||
      "Fine jewellery made in Bengaluru and Jaipur since 1998. Every piece is hallmarked, priced transparently, and made to be worn — not stored.",
    copyrightText:
      settings.copyrightText || "© 2026 Diva The Indian Jewel · GSTIN 29AABCD1234E1ZQ",
    paymentMethodsNote:
      settings.paymentMethodsNote || "UPI · Cards · Net banking · No-cost EMI",
    helpLinks: settings.helpLinks?.length
      ? settings.helpLinks.map((link) => ({
          label: link.label,
          href: link.href,
          isActive: link.isActive ?? true,
          openInNewTab: link.openInNewTab ?? false,
        }))
      : DEFAULT_HELP_LINKS,
    helpEyebrow: settings.helpPage?.eyebrow || "Help centre",
    helpTitle: settings.helpPage?.title || "Questions, answered plainly",
    helpDescription:
      settings.helpPage?.description ||
      "If your question is not here, WhatsApp us — a person replies, usually within ten minutes.",
    helpCards: settings.helpPage?.cards ?? DEFAULT_HELP_CARDS,
  };
}

type TabKey = "general" | "footer" | "links" | "faq" | "policies";

export default function SettingsPage() {
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seededFrom, setSeededFrom] = useState<StoreSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useAsyncData(
    async () => (await api.get<StoreSettings>("/admin/settings")).data,
    [],
    { errorMessage: "Could not load the store settings." },
  );

  if (data && data !== seededFrom) {
    setSeededFrom(data);
    setDraft(toDraft(data));
  }

  const errorDialog = useErrorDialog(loadError, reload);

  const field = (key: keyof Draft) => ({
    value: (draft?.[key] as string) ?? "",
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) =>
      setDraft((current) =>
        current ? { ...current, [key]: event.target.value } : current,
      ),
  });

  const save = async () => {
    if (!draft) return;

    if (!draft.storeName.trim()) return setFormError("Give the store a name.");
    if (!draft.supportEmail.trim()) return setFormError("Add a support email address.");
    if (!draft.supportPhone.trim()) return setFormError("Add a support phone number.");
    if (
      !draft.addressLine1.trim() ||
      !draft.city.trim() ||
      !draft.state.trim() ||
      !draft.pincode.trim()
    ) {
      return setFormError("Fill in the full address.");
    }

    const links = draft.helpLinks.map((link) => ({
      label: link.label.trim(),
      href: link.href.trim(),
      isActive: link.isActive,
      openInNewTab: link.openInNewTab,
    }));
    const badLink = links.findIndex((link) => !link.label || !isValidHref(link.href));
    if (badLink !== -1) {
      setActiveTab("links");
      return setFormError(
        `Help link #${badLink + 1} needs a label and a destination — a storefront path like /faq or a full https:// address.`,
      );
    }

    const cards = draft.helpCards.map((card) => ({
      title: card.title.trim(),
      body: card.body.trim(),
      href: card.href.trim(),
      cta: card.cta.trim(),
    }));
    const badCard = cards.findIndex(
      (card) => !card.title || !card.body || !card.cta || !isValidHref(card.href),
    );
    if (badCard !== -1) {
      setActiveTab("faq");
      return setFormError(
        `Help card #${badCard + 1} needs a title, description, button label and a valid destination.`,
      );
    }

    setSaving(true);
    setFormError("");

    try {
      await api.patch("/admin/settings", {
        storeName: draft.storeName.trim(),
        supportEmail: draft.supportEmail.trim(),
        supportPhone: draft.supportPhone.trim(),
        whatsappNumber: draft.whatsappNumber.trim() || undefined,
        supportHours: draft.supportHours.trim() || undefined,
        address: {
          line1: draft.addressLine1.trim(),
          line2: draft.addressLine2.trim() || undefined,
          city: draft.city.trim(),
          state: draft.state.trim(),
          pincode: draft.pincode.trim(),
          country: draft.country.trim() || "India",
        },
        social: {
          instagram: draft.instagram.trim() || undefined,
          facebook: draft.facebook.trim() || undefined,
          youtube: draft.youtube.trim() || undefined,
          pinterest: draft.pinterest.trim() || undefined,
        },
        footerBlurb: draft.footerBlurb.trim() || undefined,
        copyrightText: draft.copyrightText.trim() || undefined,
        paymentMethodsNote: draft.paymentMethodsNote.trim() || undefined,
        helpLinks: links,
        helpPage: {
          eyebrow: draft.helpEyebrow.trim() || undefined,
          title: draft.helpTitle.trim() || undefined,
          description: draft.helpDescription.trim() || undefined,
          cards,
        },
      });
      notify("Settings saved successfully");
      await reload();
    } catch (caught) {
      setFormError(
        caught instanceof AdminApiError ? caught.message : "Could not save settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  // --- Help Link Helpers ----------------------------------------------------
  const setHelpLinks = (mutate: (links: HelpLink[]) => HelpLink[]) => {
    setDraft((current) => (current ? { ...current, helpLinks: mutate(current.helpLinks) } : current));
  };

  const updateHelpLink = (index: number, patch: Partial<HelpLink>) =>
    setHelpLinks((links) => links.map((link, i) => (i === index ? { ...link, ...patch } : link)));

  const addHelpLink = () =>
    setHelpLinks((links) => [...links, { label: "", href: "/", isActive: true, openInNewTab: false }]);

  const removeHelpLink = (index: number) =>
    setHelpLinks((links) => links.filter((_, i) => i !== index));

  /** Swaps with a neighbour. Order in the array is the order in the footer. */
  const moveHelpLink = (index: number, direction: -1 | 1) =>
    setHelpLinks((links) => {
      const target = index + direction;
      if (target < 0 || target >= links.length) return links;
      const next = [...links];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  const restoreDefaultHelpLinks = () => {
    if (!window.confirm("Replace the current help links with the store defaults?")) return;
    setHelpLinks(() => DEFAULT_HELP_LINKS.map((link) => ({ ...link })));
  };

  // --- Help Card Helpers ----------------------------------------------------
  const setHelpCards = (mutate: (cards: HelpCard[]) => HelpCard[]) => {
    setDraft((current) => (current ? { ...current, helpCards: mutate(current.helpCards) } : current));
  };

  const updateHelpCard = (index: number, patch: Partial<HelpCard>) =>
    setHelpCards((cards) => cards.map((card, i) => (i === index ? { ...card, ...patch } : card)));

  const addHelpCard = () =>
    setHelpCards((cards) => [...cards, { title: "", body: "", href: "/faq", cta: "Learn more" }]);

  const removeHelpCard = (index: number) =>
    setHelpCards((cards) => cards.filter((_, i) => i !== index));

  const moveHelpCard = (index: number, direction: -1 | 1) =>
    setHelpCards((cards) => {
      const target = index + direction;
      if (target < 0 || target >= cards.length) return cards;
      const next = [...cards];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  return (
    <>
      <PageHeading
        eyebrow="Storefront"
        title="Settings & Help Navigation"
        description="Contact details, footer copy, help links, the help page and policy pages."
      />

      {(formError || loadError) && (
        <ErrorRow
          message={formError || loadError}
          onRetry={loadError ? reload : undefined}
        />
      )}

      {loading && !draft && <EditorSkeleton label="Loading settings…" />}

      {draft && (
        <div>
          {/* Navigation Tabs */}
          <div className="tab-nav" style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "1px solid var(--line, #e5e5e5)", paddingBottom: "8px", overflowX: "auto" }}>
            {[
              { id: "general" as const, label: "Store & Contact" },
              { id: "footer" as const, label: "Footer" },
              { id: "links" as const, label: "Help Links" },
              { id: "faq" as const, label: "Help Page" },
              { id: "policies" as const, label: "Policy Pages" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`secondary-button ${activeTab === tab.id ? "active" : ""}`}
                style={{
                  fontWeight: activeTab === tab.id ? "600" : "400",
                  borderColor: activeTab === tab.id ? "var(--ink, #111)" : "transparent",
                  backgroundColor: activeTab === tab.id ? "var(--bg-active, #f4f4f5)" : "transparent",
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="panel list-panel">
            {/* Tab 1: General Store & Contact */}
            {activeTab === "general" && (
              <div className="variant-card">
                <h3 style={{ marginBottom: 14 }}>Store Information</h3>
                <div className="field-grid">
                  <label className="field">
                    <span>
                      Store name <b>*</b>
                    </span>
                    <input {...field("storeName")} placeholder="DIVA" />
                  </label>
                </div>

                <h3 style={{ margin: "24px 0 14px" }}>Contact Details</h3>
                <div className="field-grid">
                  <label className="field">
                    <span>
                      Support email <b>*</b>
                    </span>
                    <input
                      {...field("supportEmail")}
                      type="email"
                      placeholder="support@diva.com"
                    />
                  </label>
                  <label className="field">
                    <span>
                      Support phone <b>*</b>
                    </span>
                    <input {...field("supportPhone")} placeholder="+91 95798 96842" />
                  </label>
                  <label className="field">
                    <span>WhatsApp number</span>
                    <input {...field("whatsappNumber")} placeholder="+91 95798 96842" />
                    <small>Leave blank to reuse the support phone number.</small>
                  </label>
                  <label className="field">
                    <span>Support hours</span>
                    <input {...field("supportHours")} placeholder="Mon–Sat, 9:00–21:00 IST" />
                  </label>
                </div>

                <h3 style={{ margin: "24px 0 14px" }}>Headquarters / Address</h3>
                <div className="field-grid">
                  <label className="field">
                    <span>
                      Address line 1 <b>*</b>
                    </span>
                    <input {...field("addressLine1")} placeholder="12 Lavelle Road" />
                  </label>
                  <label className="field">
                    <span>Address line 2</span>
                    <input {...field("addressLine2")} placeholder="Near MG Road" />
                  </label>
                  <label className="field">
                    <span>
                      City <b>*</b>
                    </span>
                    <input {...field("city")} placeholder="Bengaluru" />
                  </label>
                  <label className="field">
                    <span>
                      State <b>*</b>
                    </span>
                    <input {...field("state")} placeholder="Karnataka" />
                  </label>
                  <label className="field">
                    <span>
                      Pincode <b>*</b>
                    </span>
                    <input {...field("pincode")} placeholder="560001" />
                  </label>
                  <label className="field">
                    <span>Country</span>
                    <input {...field("country")} placeholder="India" />
                  </label>
                </div>

                <h3 style={{ margin: "24px 0 14px" }}>Social Links</h3>
                <div className="field-grid">
                  <label className="field">
                    <span>Instagram</span>
                    <input {...field("instagram")} placeholder="https://instagram.com/diva" />
                  </label>
                  <label className="field">
                    <span>Facebook</span>
                    <input {...field("facebook")} placeholder="https://facebook.com/diva" />
                  </label>
                  <label className="field">
                    <span>YouTube</span>
                    <input {...field("youtube")} placeholder="https://youtube.com/@diva" />
                  </label>
                  <label className="field">
                    <span>Pinterest</span>
                    <input {...field("pinterest")} placeholder="https://pinterest.com/diva" />
                  </label>
                </div>
              </div>
            )}

            {/* Tab 2: Footer */}
            {activeTab === "footer" && (
              <div className="variant-card">
                <h3 style={{ marginBottom: 14 }}>Footer Brand Copy & Legal</h3>
                <div className="field-grid">
                  <label className="field field-wide">
                    <span>Footer Brand Story / About Blurb</span>
                    <textarea
                      {...field("footerBlurb")}
                      rows={3}
                      placeholder="Short story displayed in the footer."
                    />
                  </label>
                  <label className="field">
                    <span>Copyright & Company Text</span>
                    <input
                      {...field("copyrightText")}
                      placeholder="© 2026 Diva The Indian Jewel · GSTIN 29AABCD1234E1ZQ"
                    />
                  </label>
                  <label className="field">
                    <span>Payment Methods Line</span>
                    <input
                      {...field("paymentMethodsNote")}
                      placeholder="UPI · Cards · Net banking · No-cost EMI"
                    />
                  </label>
                </div>

              </div>
            )}

            {/* Tab: Help links (footer "Help" column) */}
            {activeTab === "links" && (
              <div className="variant-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Footer Help Links</h3>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #666)" }}>
                      The links under &ldquo;Help&rdquo; in the storefront footer, top to bottom.
                      Use a storefront path like <code>/faq</code> or a full <code>https://</code> address.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={restoreDefaultHelpLinks}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <RotateCcw size={14} /> Restore defaults
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={addHelpLink}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <Plus size={14} /> Add Link
                    </button>
                  </div>
                </div>

                {draft.helpLinks.length === 0 ? (
                  <div className="state-row">
                    No links. The footer&rsquo;s Help column will be empty until you add one.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {draft.helpLinks.map((link, index) => {
                      const external = /^https?:\/\//i.test(link.href);
                      const hrefOk = isValidHref(link.href.trim());
                      return (
                        <div
                          key={index}
                          style={{
                            border: "1px solid var(--line, #e5e5e5)",
                            borderRadius: 6,
                            padding: 14,
                            opacity: link.isActive ? 1 : 0.65,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 10,
                            }}
                          >
                            <strong style={{ fontSize: 13 }}>Link #{index + 1}</strong>
                            {external && (
                              <span
                                className="method-pill"
                                title="Opens an address outside the storefront"
                                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                              >
                                <ExternalLink size={10} /> External
                              </span>
                            )}
                            {!link.isActive && <span className="method-pill">Hidden</span>}
                            <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => moveHelpLink(index, -1)}
                                disabled={index === 0}
                                title="Move up"
                                aria-label={`Move link ${index + 1} up`}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => moveHelpLink(index, 1)}
                                disabled={index === draft.helpLinks.length - 1}
                                title="Move down"
                                aria-label={`Move link ${index + 1} down`}
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => removeHelpLink(index)}
                                title="Remove link"
                                aria-label={`Remove link ${index + 1}`}
                                style={{ color: "#ef4444" }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="field-grid">
                            <label className="field">
                              <span>
                                Label <b>*</b>
                              </span>
                              <input
                                value={link.label}
                                onChange={(e) => updateHelpLink(index, { label: e.target.value })}
                                placeholder="e.g. Size guide"
                                maxLength={60}
                              />
                            </label>
                            <label className="field">
                              <span>
                                Destination <b>*</b>
                              </span>
                              <input
                                value={link.href}
                                onChange={(e) => updateHelpLink(index, { href: e.target.value })}
                                placeholder="/faq or https://…"
                                style={hrefOk ? undefined : { borderColor: "#ef4444" }}
                              />
                              {!hrefOk && (
                                <small style={{ color: "#ef4444" }}>
                                  Must start with / or https://
                                </small>
                              )}
                            </label>
                          </div>

                          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                            <label className="check-row" style={{ marginTop: 10 }}>
                              <input
                                type="checkbox"
                                checked={link.isActive}
                                onChange={(e) => updateHelpLink(index, { isActive: e.target.checked })}
                              />
                              <span>
                                <strong>Show in footer</strong>
                              </span>
                            </label>
                            <label className="check-row" style={{ marginTop: 10 }}>
                              <input
                                type="checkbox"
                                checked={link.openInNewTab}
                                onChange={(e) =>
                                  updateHelpLink(index, { openInNewTab: e.target.checked })
                                }
                              />
                              <span>
                                <strong>Open in a new tab</strong>
                              </span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Help page (header + cards; questions live under Policies) */}
            {activeTab === "faq" && (
              <div className="variant-card">
                <h3 style={{ marginBottom: 14 }}>Help Page Header</h3>
                <p style={{ margin: "-8px 0 14px", fontSize: "13px", color: "var(--muted, #666)" }}>
                  The heading block at the top of the /faq page.
                </p>
                <div className="field-grid">
                  <label className="field">
                    <span>Eyebrow</span>
                    <input {...field("helpEyebrow")} placeholder="Help centre" maxLength={100} />
                  </label>
                  <label className="field">
                    <span>Title</span>
                    <input {...field("helpTitle")} placeholder="Questions, answered plainly" maxLength={100} />
                  </label>
                  <label className="field field-wide">
                    <span>Intro</span>
                    <textarea
                      {...field("helpDescription")}
                      rows={2}
                      maxLength={500}
                      placeholder="If your question is not here, WhatsApp us — a person replies, usually within ten minutes."
                    />
                    <small>Shown under the title. The WhatsApp number from Store &amp; Contact is linked automatically.</small>
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    margin: "32px 0 14px",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Help Cards</h3>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #666)" }}>
                      The call-to-action cards under the questions (&ldquo;Still stuck?&rdquo;). Up to six.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addHelpCard}
                    disabled={draft.helpCards.length >= 6}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Add Card
                  </button>
                </div>

                {draft.helpCards.length === 0 ? (
                  <div className="state-row">No cards. The section is hidden on the page until you add one.</div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {draft.helpCards.map((card, index) => {
                      const hrefOk = isValidHref(card.href.trim());
                      return (
                        <div
                          key={index}
                          style={{ border: "1px solid var(--line, #e5e5e5)", borderRadius: 6, padding: 14 }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <strong style={{ fontSize: 13 }}>Card #{index + 1}</strong>
                            <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => moveHelpCard(index, -1)}
                                disabled={index === 0}
                                title="Move up"
                                aria-label={`Move card ${index + 1} up`}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => moveHelpCard(index, 1)}
                                disabled={index === draft.helpCards.length - 1}
                                title="Move down"
                                aria-label={`Move card ${index + 1} down`}
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => removeHelpCard(index)}
                                title="Remove card"
                                aria-label={`Remove card ${index + 1}`}
                                style={{ color: "#ef4444" }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="field-grid">
                            <label className="field">
                              <span>
                                Title <b>*</b>
                              </span>
                              <input
                                value={card.title}
                                onChange={(e) => updateHelpCard(index, { title: e.target.value })}
                                placeholder="Still stuck?"
                                maxLength={80}
                              />
                            </label>
                            <label className="field">
                              <span>
                                Button label <b>*</b>
                              </span>
                              <input
                                value={card.cta}
                                onChange={(e) => updateHelpCard(index, { cta: e.target.value })}
                                placeholder="Contact us"
                                maxLength={40}
                              />
                            </label>
                            <label className="field field-wide">
                              <span>
                                Description <b>*</b>
                              </span>
                              <input
                                value={card.body}
                                onChange={(e) => updateHelpCard(index, { body: e.target.value })}
                                placeholder="Message the support desk and get a reply within four working hours."
                                maxLength={300}
                              />
                            </label>
                            <label className="field field-wide">
                              <span>
                                Destination <b>*</b>
                              </span>
                              <input
                                value={card.href}
                                onChange={(e) => updateHelpCard(index, { href: e.target.value })}
                                placeholder="/contact or https://…"
                                style={hrefOk ? undefined : { borderColor: "#ef4444" }}
                              />
                              {!hrefOk && (
                                <small style={{ color: "#ef4444" }}>Must start with / or https://</small>
                              )}
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="state-row" style={{ marginTop: 28 }}>
                  The questions and answers themselves are managed under{" "}
                  <Link href="/admin/policies" className="text-button" style={{ marginLeft: 4 }}>
                    Policies &amp; FAQ
                  </Link>
                  .
                </div>
              </div>
            )}

            {/* Tab 5: Policy Pages Links */}
            {activeTab === "policies" && (
              <div className="variant-card">
                <h3 style={{ marginBottom: 8 }}>Help Policy Pages</h3>
                <p style={{ margin: "0 0 20px", fontSize: "13px", color: "var(--muted, #666)" }}>
                  Legal and customer policy pages linked in the Help footer navigation.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "16px",
                  }}
                >
                  {[
                    {
                      slug: "shipping",
                      title: "Shipping Policy",
                      desc: "Dispatch timelines, metro delivery, transit insurance and pincode serviceability.",
                      href: "/admin/policies",
                    },
                    {
                      slug: "returns",
                      title: "Returns & Exchange",
                      desc: "15-day return rules, 30-day size exchange, buyback terms and damaged items.",
                      href: "/admin/policies",
                    },
                    {
                      slug: "privacy",
                      title: "Privacy Policy",
                      desc: "Data collection, customer confidentiality, security protocols and deletion requests.",
                      href: "/admin/policies",
                    },
                    {
                      slug: "terms",
                      title: "Terms of Service",
                      desc: "Order acceptance, gold rate lock, hallmarking guarantee and governing laws.",
                      href: "/admin/policies",
                    },
                  ].map((policy) => (
                    <div
                      key={policy.slug}
                      style={{
                        border: "1px solid var(--line, #e5e5e5)",
                        padding: "16px",
                        borderRadius: "6px",
                        backgroundColor: "#fafafa",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <h4 style={{ margin: "0 0 6px", fontSize: "15px" }}>{policy.title}</h4>
                        <p style={{ margin: 0, fontSize: "13px", color: "var(--muted, #666)", lineHeight: 1.4 }}>
                          {policy.desc}
                        </p>
                      </div>
                      <Link
                        href={policy.href}
                        className="secondary-button"
                        style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content" }}
                      >
                        Edit in Policies <ArrowUpRight size={13} />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save bar */}
            <div className="editor-footer" style={{ paddingTop: 20, marginTop: 24, borderTop: "1px solid var(--line, #e5e5e5)" }}>
              <button
                className="primary-button"
                onClick={save}
                disabled={saving}
                type="button"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
                {saving ? "Saving settings…" : "Save All Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load settings"
        message={loadError}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
