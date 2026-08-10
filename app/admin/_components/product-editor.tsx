"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ImagePlus,
  Images,
  Info,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  AdminApiError,
  type Category,
  type Collection,
  type ProductDetail,
  type ProductImage,
} from "@/app/admin/_lib/api";
import {
  progressLabel,
  UploadsNotConfigured,
  useImageUpload,
  useUploadsConfigured,
} from "@/app/admin/_components/image-upload";
import { colourLabel, money, paiseToRupeeInput, rupeesToPaise } from "@/app/admin/_lib/format";
import { COLOUR_SUGGESTIONS } from "@/lib/colour";
import { MediaPicker } from "@/app/admin/_components/media-picker";
import { useToast } from "@/app/admin/_components/shell";

/**
 * The product editor, for both create and edit.
 *
 * Keeps the design's card layout, sticky sidebar and footer.
 *
 * The price is a single figure on the product: this catalogue is fixed-price
 * 1-gram-gold, so a design costs what it costs and picking rose gold over gold
 * does not change it. A variant is therefore a stock row — colour, size, SKU,
 * stock, low-stock — and nothing on it affects money.
 */

const GENDERS = ["WOMEN", "MEN", "UNISEX", "KIDS"] as const;

const OCCASIONS = [
  "DAILY_WEAR",
  "WEDDING",
  "ENGAGEMENT",
  "FESTIVAL",
  "PARTY",
  "OFFICE",
  "GIFT",
] as const;

/** Form state holds strings; conversion to paise happens on submit. */
type VariantForm = {
  key: string;
  sku: string;
  colour: string;
  size: string;
  stock: string;
  lowStockThreshold: string;
  isActive: boolean;
};

function blankVariant(): VariantForm {
  return {
    key: crypto.randomUUID(),
    sku: "",
    // The form holds the readable label; the server normalises it back to a
    // token on save, so what is typed and what is shown always match.
    colour: colourLabel("GOLD"),
    size: "",
    stock: "0",
    lowStockThreshold: "2",
    isActive: true,
  };
}

function toVariantForm(variant: ProductDetail["variants"][number]): VariantForm {
  return {
    key: variant._id,
    sku: variant.sku,
    colour: colourLabel(variant.colour),
    size: variant.size ?? "",
    stock: String(variant.stock),
    lowStockThreshold: String(variant.lowStockThreshold),
    isActive: variant.isActive,
  };
}

export function ProductEditor({ product }: { product?: ProductDetail }) {
  const router = useRouter();
  const { notify } = useToast();
  const isEdit = Boolean(product);

  const [title, setTitle] = useState(product?.title ?? "");
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(product?.categoryIds ?? []);
  const [collectionIds, setCollectionIds] = useState<string[]>(product?.collectionIds ?? []);
  const [gender, setGender] = useState(product?.attributes?.gender ?? "");
  const [occasions, setOccasions] = useState<string[]>(product?.attributes?.occasions ?? []);
  const [price, setPrice] = useState(paiseToRupeeInput(product?.pricePaise) || "");
  const [compareAtPrice, setCompareAtPrice] = useState(
    paiseToRupeeInput(product?.compareAtPricePaise) || "",
  );
  /**
   * The GST rate is no longer edited here, only displayed.
   *
   * It still has to be *known* so the pricing card can show the tax-inclusive
   * total an admin is committing to. An existing product keeps whatever rate it
   * was saved with; a new one gets the schema default, and neither `gstPercent`
   * nor `hsnCode` is sent on save — an omitted key leaves the stored value
   * alone rather than overwriting it with a form default.
   */
  const gstPercent = product?.gstPercent ?? 3;
  /**
   * A new product starts **published**, not as a draft.
   *
   * Anything added through this form is meant to be on sale; having to notice a
   * second toggle before it appears is how stock ends up invisible for a week.
   * An existing product keeps whatever state it was saved in, so opening a draft
   * to edit it does not publish it by accident.
   */
  const [published, setPublished] = useState(product ? product.status === "ACTIVE" : true);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  const [videoUrl, setVideoUrl] = useState(product?.videoUrl ?? "");
  const [variants, setVariants] = useState<VariantForm[]>(
    product?.variants.length ? product.variants.map(toVariantForm) : [blankVariant()],
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    upload: uploadImages,
    uploading,
    progress: uploadProgress,
    error: uploadError,
    compressionNotes,
  } = useImageUpload();
  const uploadsConfigured = useUploadsConfigured();

  useEffect(() => {
    void (async () => {
      try {
        const [categoryResponse, collectionResponse] = await Promise.all([
          api.get<Category[]>("/categories", { includeInactive: true }),
          api.get<Collection[]>("/collections"),
        ]);
        setCategories(categoryResponse.data);
        setCollections(collectionResponse.data);
      } catch {
        setError("Could not load categories. Save is disabled until they load.");
      }
    })();
  }, []);

  const updateVariant = (key: string, patch: Partial<VariantForm>) =>
    setVariants((current) =>
      current.map((variant) => (variant.key === key ? { ...variant, ...patch } : variant)),
    );

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  /** By id, so a child category can name its parent without a nested fetch. */
  const categoryLookup = useMemo(
    () => new Map(categories.map((category) => [category._id, category])),
    [categories],
  );

  // --- Images --------------------------------------------------------------

  const upload = async (files: FileList) => {
    const uploaded = await uploadImages(files, {
      folder: "product",
      altFallback: title,
      // Continues the existing sequence so a second batch does not reset every
      // new image to displayOrder 0 and scramble the gallery.
      startIndex: images.length,
    });

    if (uploaded.length) {
      setImages((current) => [...current, ...uploaded]);
      notify(`${uploaded.length} image(s) uploaded`);
    }

    if (fileInput.current) fileInput.current.value = "";
  };

  // --- Submit --------------------------------------------------------------

  const buildPayload = () => ({
    title: title.trim(),
    shortDescription: shortDescription.trim() || undefined,
    description: description.trim() || undefined,
    categoryIds,
    collectionIds,
    // `tags` is not sent: the field is gone from the form, and an omitted key
    // leaves whatever a product already has rather than wiping it on every save.
    attributes: {
      ...(gender ? { gender } : {}),
      occasions,
    },
    status: published ? ("ACTIVE" as const) : ("DRAFT" as const),
    isFeatured,
    pricePaise: rupeesToPaise(price),
    // Null, not undefined: on an edit that is what clears a compare-at price
    // the admin has emptied out.
    compareAtPricePaise: compareAtPrice ? rupeesToPaise(compareAtPrice) : null,
    images,
    // Null, not undefined: clearing the field must remove the stored video
    // rather than leave the old link in place on an edit.
    videoUrl: videoUrl.trim() || null,
    variants: variants.map((variant) => ({
      sku: variant.sku.trim().toUpperCase(),
      // Sent as typed. The server owns the normalisation so that every client —
      // this form, a future app, a bulk import — lands on the same token.
      colour: variant.colour.trim(),
      ...(variant.size.trim() ? { size: variant.size.trim() } : {}),
      stock: Number(variant.stock) || 0,
      lowStockThreshold: Number(variant.lowStockThreshold) || 0,
      images: [],
      isActive: variant.isActive,
    })),
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    if (!title.trim()) {
      setError("Give the product a name before saving.");
      return;
    }
    if (categoryIds.length === 0) {
      setError("Choose at least one category.");
      return;
    }
    if (variants.some((variant) => !variant.sku.trim())) {
      setError("Every variant needs a SKU.");
      return;
    }
    if (variants.some((variant) => !variant.colour.trim())) {
      setError("Every variant needs a colour.");
      return;
    }
    if (rupeesToPaise(price) <= 0) {
      // Checked here rather than left to the server: a product saved at ₹0 is
      // refused by the pricing engine and cannot be bought, which looks like a
      // storefront bug rather than a missing field.
      setError("Give the product a price.");
      return;
    }

    setSaving(true);

    try {
      const payload = buildPayload();

      if (isEdit && product) {
        await api.patch(`/admin/products/${product._id}`, payload);
        notify("Product updated");
      } else {
        await api.post("/admin/products", payload);
        notify("Product saved to your catalogue");
      }

      router.push("/admin/products");
      router.refresh();
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        setError(caught.message);
        // The server returns dotted paths (`variants.0.netWeightMg`), so the
        // form can place each message beside the input that caused it rather
        // than dumping a list at the top.
        setFieldErrors(
          Object.fromEntries(caught.details.map((detail) => [detail.path, detail.message])),
        );
      } else {
        setError("Could not save this product.");
      }
      setSaving(false);
    }
  };

  const variantError = (index: number, field: string) =>
    fieldErrors[`variants.${index}.${field}`];

  return (
    <form className="product-editor" onSubmit={submit}>
      <div className="editor-topbar">
        <Link href="/admin/products" className="back-link">
          <ArrowLeft />
          Back to products
        </Link>
        <div className="editor-status">
          <span className={`status-badge ${published ? "status-stock" : "status-low"}`}>
            <span className="status-dot" />
            {published ? "Published" : "Draft"}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPublished((current) => !current)}
          >
            {published ? "Switch to draft" : "Mark as published"}
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? <Loader2 className="spin" /> : <Check />}
            {saving ? "Saving…" : "Save product"}
          </button>
        </div>
      </div>

      <div className="editor-heading">
        <div>
          <div className="eyebrow">Catalog / {isEdit ? "Edit product" : "New product"}</div>
          <h1>{isEdit ? title || "Edit product" : "Add a product"}</h1>
          <p>
            One price per product. Each colour and size is a variant with its own SKU
            and stock.
          </p>
        </div>
      </div>

      {(error || uploadError) && (
        <div className="form-alert" role="alert">
          <Info />
          <span>{error || uploadError}</span>
        </div>
      )}

      <div className="editor-layout">
        <div className="editor-main">
          <section className="form-card">
            <div className="form-card-heading">
              <div>
                <h2>Product details</h2>
                <p>Give customers the story behind this piece.</p>
              </div>
              <span className="required-note">* Required</span>
            </div>
            <div className="field-grid">
              <label className="field field-wide">
                <span>
                  Product name <b>*</b>
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Celeste Tennis Bracelet"
                  className={fieldErrors.title ? "has-error" : ""}
                />
                {fieldErrors.title && <small className="field-error">{fieldErrors.title}</small>}
              </label>
              <label className="field field-wide">
                <span>Short description</span>
                <input
                  value={shortDescription}
                  onChange={(event) => setShortDescription(event.target.value)}
                  placeholder="One line shown on product cards"
                />
              </label>
              <label className="field field-wide">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe materials, details, and the feeling behind this piece."
                  rows={5}
                />
              </label>
            </div>
          </section>

          <section className="form-card">
            <div className="form-card-heading">
              <div>
                <h2>Media</h2>
                <p>Showcase the details that make this piece special.</p>
              </div>
            </div>

            <div className="media-dropzone">
              <div className="media-icon">
                <ImagePlus />
              </div>
              <strong>Add product images</strong>
              <span>
                JPG, PNG or WebP, any size — anything oversized is compressed in your
                browser before it is sent
              </span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => event.target.files && upload(event.target.files)}
              />
              <button
                type="button"
                className="secondary-button"
                disabled={uploading || !uploadsConfigured}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? <Loader2 className="spin" /> : null}
                {uploading ? progressLabel(uploadProgress) : "Choose images"}
              </button>

              <button
                type="button"
                className="link-button"
                disabled={uploading}
                onClick={() => setPickingImage(true)}
              >
                <Images /> Reuse an existing image
              </button>

              {uploading && uploadProgress?.fraction != null && (
                <progress
                  className="upload-bar"
                  value={uploadProgress.fraction}
                  max={1}
                />
              )}
            </div>

            {!uploading && compressionNotes.length > 0 && (
              <ul className="compress-note-list">
                {compressionNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}

            {!uploadsConfigured && <UploadsNotConfigured />}

            <label className="field field-wide" style={{ marginTop: 18 }}>
              <span>YouTube video</span>
              <input
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="https://youtube.com/shorts/…"
                inputMode="url"
                className={fieldErrors.videoUrl ? "has-error" : ""}
              />
              {fieldErrors.videoUrl ? (
                <small className="field-error">{fieldErrors.videoUrl}</small>
              ) : (
                <small>
                  Paste a Shorts, youtu.be or watch link — any of them work. Leave empty for
                  no video.
                </small>
              )}
            </label>

            <MediaPicker
              open={pickingImage}
              onClose={() => setPickingImage(false)}
              onPick={(image) =>
                setImages((current) =>
                  // Guard the reuse case specifically: attaching the same asset
                  // twice renders a duplicate tile and a duplicate gallery slide.
                  current.some((entry) => entry.publicId === image.publicId)
                    ? current
                    : [...current, { ...image, displayOrder: current.length }],
                )
              }
              title="Reuse an existing image"
            />

            {images.length > 0 && (
              <div className="media-grid">
                {images.map((image) => (
                  <div className="media-tile" key={image.publicId}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={image.alt} />
                    <button
                      type="button"
                      className="media-remove"
                      aria-label={`Remove ${image.alt}`}
                      onClick={() =>
                        setImages((current) =>
                          current.filter((entry) => entry.publicId !== image.publicId),
                        )
                      }
                    >
                      <X />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="form-card">
            <div className="form-card-heading">
              <div>
                <h2>Pricing</h2>
                <p>What this piece sells for, before tax.</p>
              </div>
            </div>
            <div className="field-grid field-grid-two" style={{ marginTop: 0 }}>
              <label className="field">
                <span>
                  Price (₹) <b>*</b>
                </span>
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="1299.00"
                  inputMode="decimal"
                  className={fieldErrors.pricePaise ? "has-error" : ""}
                />
                {fieldErrors.pricePaise && (
                  <small className="field-error">{fieldErrors.pricePaise}</small>
                )}
              </label>
              <label className="field">
                <span>Compare at (₹)</span>
                <input
                  value={compareAtPrice}
                  onChange={(event) => setCompareAtPrice(event.target.value)}
                  placeholder="Optional"
                  inputMode="decimal"
                />
                <small>Shown struck through beside the price.</small>
              </label>
            </div>
            <p className="price-preview-note">
              {rupeesToPaise(price) > 0
                ? `Customer pays ${money(
                    rupeesToPaise(price) +
                      Math.round((rupeesToPaise(price) * gstPercent) / 100),
                  )} including ${gstPercent}% GST.`
                : "Enter a price to see the tax-inclusive total."}
            </p>
          </section>

          <section className="form-card">
            <div className="form-card-heading">
              <div>
                <h2>Variants</h2>
                <p>
                  Each colour and size combination is a variant with its own SKU and stock.
                  All of them sell at the price above.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setVariants((current) => [...current, blankVariant()])}
              >
                <Plus />
                Add variant
              </button>
            </div>

            {/*
              One list shared by every variant row's colour input. Suggestions
              only — the input accepts anything typed, and the server normalises
              it so a new finish still groups cleanly in filters and inventory.
            */}
            <datalist id="variant-colour-options">
              {COLOUR_SUGGESTIONS.map((colour) => (
                <option key={colour} value={colourLabel(colour)} />
              ))}
            </datalist>

            {variants.map((variant, index) => (
              <div className="variant-card" key={variant.key}>
                <div className="variant-card-head">
                  <strong>
                    Variant {index + 1}
                    {variant.sku ? ` · ${variant.sku}` : ""}
                  </strong>
                  {variants.length > 1 && (
                    <button
                      type="button"
                      className="row-action"
                      aria-label={`Remove variant ${index + 1}`}
                      onClick={() =>
                        setVariants((current) =>
                          current.filter((entry) => entry.key !== variant.key),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  )}
                </div>

                <div className="field-grid field-grid-three">
                  <label className="field">
                    <span>
                      SKU <b>*</b>
                    </span>
                    <input
                      value={variant.sku}
                      onChange={(event) => updateVariant(variant.key, { sku: event.target.value })}
                      placeholder="DIVA-RG-001"
                      className={variantError(index, "sku") ? "has-error" : ""}
                    />
                    {variantError(index, "sku") && (
                      <small className="field-error">{variantError(index, "sku")}</small>
                    )}
                  </label>

                  <label className="field">
                    <span>
                      Colour <b>*</b>
                    </span>
                    {/*
                      A text input with a datalist, not a select: the presets are
                      one click away, and anything else can simply be typed. A
                      select with a "Custom…" option would need a second input
                      that only sometimes exists.
                    */}
                    <input
                      value={variant.colour}
                      onChange={(event) =>
                        updateVariant(variant.key, { colour: event.target.value })
                      }
                      list="variant-colour-options"
                      placeholder="Gold, or type your own"
                      className={variantError(index, "colour") ? "has-error" : ""}
                    />
                    {variantError(index, "colour") ? (
                      <small className="field-error">{variantError(index, "colour")}</small>
                    ) : (
                      <small>Pick a suggestion or enter any finish you stock.</small>
                    )}
                  </label>

                  <label className="field">
                    <span>Size</span>
                    <input
                      value={variant.size}
                      onChange={(event) => updateVariant(variant.key, { size: event.target.value })}
                      placeholder="14, 18in, free"
                    />
                  </label>

                  <label className="field">
                    <span>Stock</span>
                    <input
                      value={variant.stock}
                      onChange={(event) =>
                        updateVariant(variant.key, { stock: event.target.value })
                      }
                      inputMode="numeric"
                    />
                  </label>

                  <label className="field">
                    <span>Low stock at</span>
                    <input
                      value={variant.lowStockThreshold}
                      onChange={(event) =>
                        updateVariant(variant.key, { lowStockThreshold: event.target.value })
                      }
                      inputMode="numeric"
                    />
                    <small>Flagged on the inventory screen at or below this.</small>
                  </label>
                </div>
              </div>
            ))}
          </section>
        </div>

        <aside className="editor-side">
          <section className="form-card">
            <div className="form-card-heading">
              <div>
                <h2>Organisation</h2>
                <p>Help customers discover this product.</p>
              </div>
            </div>

            <div className="field">
              <span>
                Categories <b>*</b>
              </span>

              {categories.length === 0 ? (
                <p className="picker-empty">
                  No categories yet.{" "}
                  <Link href="/admin/categories">Create one first</Link> — a product
                  needs at least one.
                </p>
              ) : (
                <div className="category-picker">
                  {categories.map((category) => {
                    const selected = categoryIds.includes(category._id);
                    // Parent name, so "Engagement" is not ambiguous between
                    // Rings and Necklaces once the tree has any depth.
                    const parent = category.parentId
                      ? categoryLookup.get(category.parentId)?.name
                      : undefined;

                    return (
                      <button
                        type="button"
                        key={category._id}
                        aria-pressed={selected}
                        className={`category-option ${selected ? "category-option-selected" : ""}`}
                        onClick={() =>
                          setCategoryIds((current) => toggle(current, category._id))
                        }
                      >
                        {category.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            className="category-option-thumb"
                            src={category.image.url}
                            alt=""
                          />
                        ) : (
                          <span
                            className="category-option-thumb category-option-thumb-empty"
                            aria-hidden="true"
                          >
                            <ImagePlus />
                          </span>
                        )}

                        <span className="category-option-text">
                          <strong>{category.name}</strong>
                          {parent && <small>in {parent}</small>}
                        </span>

                        {selected && (
                          <span className="category-option-check">
                            <Check />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {collections.length > 0 && (
              <div className="field" style={{ marginTop: 16 }}>
                <span>Collections</span>
                <div className="chip-row">
                  {collections.map((collection) => (
                    <button
                      type="button"
                      key={collection._id}
                      className={`chip ${collectionIds.includes(collection._id) ? "chip-selected" : ""}`}
                      onClick={() => setCollectionIds((current) => toggle(current, collection._id))}
                    >
                      {collectionIds.includes(collection._id) && <Check />}
                      {collection.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="check-row">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
              />
              <span>
                <strong>Feature this product</strong>
                <small>Surfaces it on the storefront homepage.</small>
              </span>
            </label>
          </section>

          <section className="form-card">
            <div className="form-card-heading">
              <div>
                <h2>Attributes</h2>
                <p>Used by storefront filters.</p>
              </div>
            </div>

            <label className="field">
              <span>Worn by</span>
              <select value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="">Not specified</option>
                {GENDERS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry.charAt(0) + entry.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>

            <div className="field" style={{ marginTop: 15 }}>
              <span>Occasions</span>
              <div className="chip-row">
                {OCCASIONS.map((occasion) => (
                  <button
                    type="button"
                    key={occasion}
                    className={`chip ${occasions.includes(occasion) ? "chip-selected" : ""}`}
                    onClick={() => setOccasions((current) => toggle(current, occasion))}
                  >
                    {occasions.includes(occasion) && <Check />}
                    {occasion.replace(/_/g, " ").toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </section>

        </aside>
      </div>

      <div className="editor-footer">
        <Link href="/admin/products" className="secondary-button">
          Cancel
        </Link>
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? <Loader2 className="spin" /> : <Check />}
          {saving ? "Saving…" : "Save product"}
        </button>
      </div>
    </form>
  );
}
