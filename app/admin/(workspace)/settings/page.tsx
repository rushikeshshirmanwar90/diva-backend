"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  api,
  AdminApiError,
  type FaqGroup,
  type StoreAssurance,
  type StoreLocation,
  type StoreSettings,
} from "@/app/admin/_lib/api";
import { EditorSkeleton, ErrorDialog, ErrorRow, PageHeading } from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

const DEFAULT_ASSURANCES: StoreAssurance[] = [
  {
    title: "BIS hallmarked",
    body: "HUID on every gold piece, verifiable in the BIS Care app.",
    icon: "BadgeCheck",
  },
  {
    title: "Insured delivery",
    body: "Fully insured and tracked until it is signed for.",
    icon: "Truck",
  },
  {
    title: "15-day returns",
    body: "Plus one free size exchange within 30 days.",
    icon: "RotateCcw",
  },
  {
    title: "Lifetime care",
    body: "Free cleaning, polishing and re-rhodium plating.",
    icon: "ShieldCheck",
  },
];

const DEFAULT_STORES: StoreLocation[] = [
  {
    city: "Bengaluru",
    tag: "Flagship",
    address: "12 Lavelle Road, Bengaluru 560001",
    phone: "+91 95798 96842",
    hours: "Mon–Sat 10:30–20:00 · Sun 11:00–18:00",
    note: "Bridal appointments and purity assays available here.",
  },
  {
    city: "Chennai",
    tag: "Counter",
    address: "48 Nungambakkam High Road, Chennai 600034",
    phone: "+91 95798 96842",
    hours: "Mon–Sat 10:30–20:00 · Sun closed",
    note: "Temple and 22K collections held in depth.",
  },
  {
    city: "Hyderabad",
    tag: "Counter",
    address: "9 Road No. 12, Banjara Hills, Hyderabad 500034",
    phone: "+91 95798 96842",
    hours: "Tue–Sun 11:00–20:00 · Mon closed",
    note: "Polki and diamond bridal, by appointment on weekends.",
  },
];

const DEFAULT_FAQS: FaqGroup[] = [
  {
    group: "Orders & Delivery",
    items: [
      {
        q: "How long does delivery take?",
        a: "In-stock pieces ship within 48 hours and reach most Indian metros in 2–4 working days, insured and fully tracked. Made-to-order and bridal pieces take 6–8 weeks from design freeze.",
      },
      {
        q: "Is shipping insured?",
        a: "Yes. Every shipment is insured for its full declared value until it is signed for. We ship only through Bluedart and Delhivery secure-jewellery services.",
      },
      {
        q: "Do you ship outside India?",
        a: "Not yet. We are working through customs and hallmarking requirements for the UAE, UK and Singapore.",
      },
    ],
  },
  {
    group: "Pricing & Payment",
    items: [
      {
        q: "What does the price include?",
        a: "Metal value at today's rate, making charges, stone value where applicable, and 3% GST. Every product page breaks this down line by line.",
      },
      {
        q: "Which payment methods do you accept?",
        a: "UPI, all major credit and debit cards, net banking and no-cost EMI on orders above ₹25,000, all through PhonePe's secure gateway.",
      },
    ],
  },
  {
    group: "Returns, Exchange & Buyback",
    items: [
      {
        q: "What is the return window?",
        a: "15 days from delivery on all in-stock pieces, provided the hallmark tag is unbroken. Refunds are credited to the original payment method within 5 working days.",
      },
      {
        q: "Can I exchange for a different size?",
        a: "Once, free, within 30 days — including two-way courier on rings, bangles and bracelets.",
      },
      {
        q: "Do you buy back old gold?",
        a: "Yes, at 100% of current metal value for pieces bought from us, and 92% for pieces bought elsewhere, after an in-person purity assay.",
      },
    ],
  },
  {
    group: "Authenticity & Care",
    items: [
      {
        q: "Is everything hallmarked?",
        a: "Every gold piece carries a BIS hallmark and a six-digit HUID you can verify yourself in the BIS Care app. Diamond pieces above 0.30ct ship with an IGI or GIA certificate.",
      },
      {
        q: "Do you offer cleaning and polishing?",
        a: "Free ultrasonic cleaning and re-polishing for life at any Diva counter. Polki and pearl pieces are cleaned by hand.",
      },
    ],
  },
];

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
  assurances: StoreAssurance[];
  contactEyebrow: string;
  contactTitle: string;
  contactDescription: string;
  stores: StoreLocation[];
  faqs: FaqGroup[];
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
      settings.copyrightText || "© 2026 Diva The Indian Jewel Pvt. Ltd. · GSTIN 29AABCD1234E1ZQ",
    paymentMethodsNote:
      settings.paymentMethodsNote || "UPI · Cards · Net banking · No-cost EMI",
    assurances: settings.assurances?.length ? settings.assurances : DEFAULT_ASSURANCES,
    contactEyebrow: settings.contactPage?.eyebrow || "We answer in under four hours",
    contactTitle: settings.contactPage?.title || "Talk to a person",
    contactDescription:
      settings.contactPage?.description ||
      "No chatbots. Messages reach the same team that handles the counters, and bridal enquiries go straight to a senior consultant.",
    stores: settings.contactPage?.stores?.length ? settings.contactPage.stores : DEFAULT_STORES,
    faqs: settings.faqs?.length ? settings.faqs : DEFAULT_FAQS,
  };
}

type TabKey = "general" | "footer" | "contact" | "faq" | "policies";

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
        assurances: draft.assurances.map((a) => ({
          title: a.title.trim(),
          body: a.body.trim(),
          icon: a.icon?.trim() || undefined,
        })),
        contactPage: {
          eyebrow: draft.contactEyebrow.trim() || undefined,
          title: draft.contactTitle.trim() || undefined,
          description: draft.contactDescription.trim() || undefined,
          stores: draft.stores.map((s) => ({
            city: s.city.trim(),
            tag: s.tag.trim() || "Counter",
            address: s.address.trim(),
            phone: s.phone.trim(),
            hours: s.hours.trim(),
            note: s.note?.trim() || undefined,
          })),
        },
        faqs: draft.faqs.map((group) => ({
          group: group.group.trim(),
          items: group.items.map((i) => ({
            q: i.q.trim(),
            a: i.a.trim(),
          })),
        })),
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

  // --- Assurance Helpers ----------------------------------------------------
  const updateAssurance = (index: number, patch: Partial<StoreAssurance>) => {
    setDraft((current) => {
      if (!current) return current;
      const assurances = current.assurances.map((a, i) =>
        i === index ? { ...a, ...patch } : a,
      );
      return { ...current, assurances };
    });
  };

  const addAssurance = () => {
    setDraft((current) =>
      current
        ? {
            ...current,
            assurances: [
              ...current.assurances,
              { title: "New guarantee", body: "Description of guarantee", icon: "ShieldCheck" },
            ],
          }
        : current,
    );
  };

  const removeAssurance = (index: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            assurances: current.assurances.filter((_, i) => i !== index),
          }
        : current,
    );
  };

  // --- Store Location Helpers -----------------------------------------------
  const updateStore = (index: number, patch: Partial<StoreLocation>) => {
    setDraft((current) => {
      if (!current) return current;
      const stores = current.stores.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...current, stores };
    });
  };

  const addStore = () => {
    setDraft((current) =>
      current
        ? {
            ...current,
            stores: [
              ...current.stores,
              {
                city: "New city",
                tag: "Counter",
                address: "Store address line",
                phone: current.supportPhone || "+91 95798 96842",
                hours: "Mon–Sat 10:30–20:00",
                note: "",
              },
            ],
          }
        : current,
    );
  };

  const removeStore = (index: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            stores: current.stores.filter((_, i) => i !== index),
          }
        : current,
    );
  };

  // --- FAQ Helpers ----------------------------------------------------------
  const updateFaqGroupTitle = (groupIndex: number, group: string) => {
    setDraft((current) => {
      if (!current) return current;
      const faqs = current.faqs.map((g, i) => (i === groupIndex ? { ...g, group } : g));
      return { ...current, faqs };
    });
  };

  const addFaqGroup = () => {
    setDraft((current) =>
      current
        ? {
            ...current,
            faqs: [
              ...current.faqs,
              {
                group: "New FAQ Category",
                items: [{ q: "Sample question?", a: "Sample answer." }],
              },
            ],
          }
        : current,
    );
  };

  const removeFaqGroup = (groupIndex: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            faqs: current.faqs.filter((_, i) => i !== groupIndex),
          }
        : current,
    );
  };

  const updateFaqItem = (
    groupIndex: number,
    itemIndex: number,
    patch: { q?: string; a?: string },
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const faqs = current.faqs.map((g, gi) => {
        if (gi !== groupIndex) return g;
        const items = g.items.map((item, ii) =>
          ii === itemIndex ? { ...item, ...patch } : item,
        );
        return { ...g, items };
      });
      return { ...current, faqs };
    });
  };

  const addFaqItem = (groupIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      const faqs = current.faqs.map((g, gi) => {
        if (gi !== groupIndex) return g;
        return {
          ...g,
          items: [...g.items, { q: "New Question?", a: "Detailed answer." }],
        };
      });
      return { ...current, faqs };
    });
  };

  const removeFaqItem = (groupIndex: number, itemIndex: number) => {
    setDraft((current) => {
      if (!current) return current;
      const faqs = current.faqs.map((g, gi) => {
        if (gi !== groupIndex) return g;
        return {
          ...g,
          items: g.items.filter((_, ii) => ii !== itemIndex),
        };
      });
      return { ...current, faqs };
    });
  };

  return (
    <>
      <PageHeading
        eyebrow="Storefront"
        title="Settings & Help Navigation"
        description="Configure contact info, footer branding, assurances, physical stores, FAQ, and policy pages."
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
              { id: "footer" as const, label: "Footer & Assurances" },
              { id: "contact" as const, label: "Contact & Stores Page" },
              { id: "faq" as const, label: "Help & FAQ Content" },
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

            {/* Tab 2: Footer & Assurances */}
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
                      placeholder="© 2026 Diva The Indian Jewel Pvt. Ltd. · GSTIN 29AABCD1234E1ZQ"
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

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    margin: "32px 0 14px",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Footer Assurance Badges</h3>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #666)" }}>
                      The 4 guarantee cards shown across the top of the footer.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addAssurance}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Add Badge
                  </button>
                </div>

                <div style={{ display: "grid", gap: 16 }}>
                  {draft.assurances.map((assurance, index) => (
                    <div
                      key={index}
                      style={{
                        border: "1px solid var(--line, #e5e5e5)",
                        padding: "16px",
                        borderRadius: "6px",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        <strong style={{ fontSize: "13px" }}>Badge #{index + 1}</strong>
                        {draft.assurances.length > 1 && (
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => removeAssurance(index)}
                            title="Remove badge"
                            style={{ color: "#ef4444" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="field-grid">
                        <label className="field">
                          <span>Title</span>
                          <input
                            value={assurance.title}
                            onChange={(e) => updateAssurance(index, { title: e.target.value })}
                            placeholder="e.g. BIS hallmarked"
                          />
                        </label>
                        <label className="field">
                          <span>Description</span>
                          <input
                            value={assurance.body}
                            onChange={(e) => updateAssurance(index, { body: e.target.value })}
                            placeholder="e.g. HUID on every gold piece"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: Contact & Stores Page */}
            {activeTab === "contact" && (
              <div className="variant-card">
                <h3 style={{ marginBottom: 14 }}>Contact Page Header</h3>
                <div className="field-grid">
                  <label className="field">
                    <span>Eyebrow tag</span>
                    <input
                      {...field("contactEyebrow")}
                      placeholder="We answer in under four hours"
                    />
                  </label>
                  <label className="field">
                    <span>Page Title</span>
                    <input {...field("contactTitle")} placeholder="Talk to a person" />
                  </label>
                  <label className="field field-wide">
                    <span>Description blurb</span>
                    <textarea
                      {...field("contactDescription")}
                      rows={2}
                      placeholder="Introductory text on the /contact page."
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    margin: "32px 0 14px",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Physical Store Counters</h3>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #666)" }}>
                      Locations listed on the /contact page.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addStore}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Add Store Location
                  </button>
                </div>

                <div style={{ display: "grid", gap: 16 }}>
                  {draft.stores.map((store, index) => (
                    <div
                      key={index}
                      style={{
                        border: "1px solid var(--line, #e5e5e5)",
                        padding: "16px",
                        borderRadius: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        <strong style={{ fontSize: "13px" }}>
                          {store.city || `Store #${index + 1}`} ({store.tag})
                        </strong>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => removeStore(index)}
                          title="Remove store"
                          style={{ color: "#ef4444" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="field-grid">
                        <label className="field">
                          <span>City</span>
                          <input
                            value={store.city}
                            onChange={(e) => updateStore(index, { city: e.target.value })}
                            placeholder="e.g. Bengaluru"
                          />
                        </label>
                        <label className="field">
                          <span>Tag / Store Type</span>
                          <input
                            value={store.tag}
                            onChange={(e) => updateStore(index, { tag: e.target.value })}
                            placeholder="Flagship, Counter, Atelier..."
                          />
                        </label>
                        <label className="field field-wide">
                          <span>Address</span>
                          <input
                            value={store.address}
                            onChange={(e) => updateStore(index, { address: e.target.value })}
                            placeholder="Full store address"
                          />
                        </label>
                        <label className="field">
                          <span>Phone</span>
                          <input
                            value={store.phone}
                            onChange={(e) => updateStore(index, { phone: e.target.value })}
                            placeholder="+91 95798 96842"
                          />
                        </label>
                        <label className="field">
                          <span>Opening Hours</span>
                          <input
                            value={store.hours}
                            onChange={(e) => updateStore(index, { hours: e.target.value })}
                            placeholder="Mon–Sat 10:30–20:00 · Sun 11:00–18:00"
                          />
                        </label>
                        <label className="field field-wide">
                          <span>Note / Specialties</span>
                          <input
                            value={store.note || ""}
                            onChange={(e) => updateStore(index, { note: e.target.value })}
                            placeholder="e.g. Bridal appointments and purity assays available here."
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 4: Help & FAQ Content */}
            {activeTab === "faq" && (
              <div className="variant-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Help & FAQ Management</h3>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #666)" }}>
                      Questions and answers displayed on the /faq page.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addFaqGroup}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Add FAQ Category
                  </button>
                </div>

                <div style={{ display: "grid", gap: 24 }}>
                  {draft.faqs.map((group, groupIndex) => (
                    <div
                      key={groupIndex}
                      style={{
                        border: "1px solid var(--line, #e5e5e5)",
                        padding: "18px",
                        borderRadius: "6px",
                        backgroundColor: "#fafafa",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 14,
                        }}
                      >
                        <label style={{ flex: 1, marginRight: 16 }}>
                          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted, #666)" }}>
                            Category Name
                          </span>
                          <input
                            value={group.group}
                            onChange={(e) =>
                              updateFaqGroupTitle(groupIndex, e.target.value)
                            }
                            placeholder="e.g. Orders & Delivery"
                            style={{
                              width: "100%",
                              fontSize: "15px",
                              fontWeight: "600",
                              marginTop: "4px",
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => removeFaqGroup(groupIndex)}
                          title="Delete category"
                          style={{ color: "#ef4444" }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        {group.items.map((item, itemIndex) => (
                          <div
                            key={itemIndex}
                            style={{
                              backgroundColor: "#fff",
                              padding: "12px",
                              border: "1px solid var(--line, #e5e5e5)",
                              borderRadius: "4px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 6,
                              }}
                            >
                              <span style={{ fontSize: "12px", fontWeight: "600" }}>
                                Q#{itemIndex + 1}
                              </span>
                              {group.items.length > 1 && (
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() =>
                                    removeFaqItem(groupIndex, itemIndex)
                                  }
                                  title="Remove question"
                                  style={{ color: "#ef4444" }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                            <input
                              value={item.q}
                              onChange={(e) =>
                                updateFaqItem(groupIndex, itemIndex, {
                                  q: e.target.value,
                                })
                              }
                              placeholder="Question text"
                              style={{ width: "100%", marginBottom: 8 }}
                            />
                            <textarea
                              value={item.a}
                              onChange={(e) =>
                                updateFaqItem(groupIndex, itemIndex, {
                                  a: e.target.value,
                                })
                              }
                              rows={3}
                              placeholder="Answer text"
                              style={{ width: "100%" }}
                            />
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="link-button"
                        onClick={() => addFaqItem(groupIndex)}
                        style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <Plus size={13} /> Add Question to this category
                      </button>
                    </div>
                  ))}
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
