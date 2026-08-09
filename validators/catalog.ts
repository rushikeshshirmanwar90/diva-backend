import { z } from "zod";
import {
  objectId,
  slug,
  paise,
  imageInput,
  seoInput,
  pagination,
  csvArray,
  booleanFlag,
} from "@/validators/common";
import { GENDERS, OCCASIONS, PRODUCT_STATUSES } from "@/models/enums";
import { toColourValue } from "@/lib/colour";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    /** Derived from the name when omitted. Supplied explicitly for SEO control. */
    slug: slug.optional(),
    description: z.string().trim().max(2000).optional(),
    parentId: objectId.nullable().optional(),
    /**
     * Nullable, not merely optional. Omitting the key means "leave it alone";
     * sending `null` means "remove the image". Without the distinction there is
     * no way to clear a hero image once one has been set, because a partial
     * update cannot express absence.
     */
    image: imageInput.nullish(),
    /** Same nullable-means-clear contract as `image`. */
    bannerImage: imageInput.nullish(),
    icon: z.string().trim().max(40).optional(),
    displayOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    seo: seoInput.optional(),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.partial().strict();

export const listCategoriesSchema = z
  .object({
    parentId: objectId.optional(),
    /** `true` returns only top-level categories. */
    rootOnly: booleanFlag.optional(),
    includeInactive: booleanFlag.optional(),
    featured: booleanFlag.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export const createCollectionSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: slug.optional(),
    description: z.string().trim().max(2000).optional(),
    productIds: z.array(objectId).max(500).default([]),
    bannerImage: imageInput.optional(),
    mobileBannerImage: imageInput.optional(),
    displayOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    seo: seoInput.optional(),
  })
  .strict()
  .refine(
    (value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt,
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  );

export const updateCollectionSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    slug: slug.optional(),
    description: z.string().trim().max(2000).optional(),
    productIds: z.array(objectId).max(500).optional(),
    bannerImage: imageInput.optional(),
    mobileBannerImage: imageInput.optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    seo: seoInput.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * A variant: one colour, one size, its own SKU and stock.
 *
 * No price here — the product carries it. `reservedStock` is absent by design:
 * it is owned by the checkout's stock-hold logic and an admin form that could
 * write it would release live holds.
 */
export const variantInput = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9-]+$/, "SKU may contain only letters, numbers and hyphens"),
    /**
     * Free text, normalised rather than constrained.
     *
     * The client may send "Rose Gold" or "rose-gold"; both are stored as
     * `ROSE_GOLD`. Normalising here rather than trusting the caller means the
     * admin console, a future mobile app and a bulk import cannot each invent
     * their own spelling of the same finish.
     */
    colour: z
      .string()
      .trim()
      .min(1, "Give the variant a colour")
      .max(60)
      .transform(toColourValue)
      .refine((value) => value.length > 0, "That colour has no usable characters in it"),
    size: z.string().trim().max(24).optional(),

    stock: z.number().int().min(0).default(0),
    lowStockThreshold: z.number().int().min(0).default(2),

    images: z.array(imageInput).max(10).default([]),
    isActive: z.boolean().default(true),
  })
  .strict();

export const createProductSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    slug: slug.optional(),
    shortDescription: z.string().trim().max(300).optional(),
    description: z.string().trim().max(8000).optional(),

    categoryIds: z.array(objectId).min(1, "Choose at least one category").max(10),
    collectionIds: z.array(objectId).max(20).default([]),
    brand: z.string().trim().max(60).default("DIVA"),

    variants: z.array(variantInput).min(1, "A product needs at least one variant").max(60),
    images: z.array(imageInput).max(15).default([]),
    videoUrl: z.url().optional(),

    /** Pre-tax, in paise. What every price in the system is derived from. */
    pricePaise: paise.min(1, "Give the product a price"),
    compareAtPricePaise: paise.nullable().optional(),

    attributes: z
      .object({
        gender: z.enum(GENDERS).optional(),
        occasions: z.array(z.enum(OCCASIONS)).max(7).default([]),
        style: z.string().trim().max(60).optional(),
        finish: z.string().trim().max(60).optional(),
        certification: z.string().trim().max(120).optional(),
      })
      .strict()
      .default({ occasions: [] }),

    tags: z.array(z.string().trim().max(40)).max(25).default([]),

    status: z.enum(PRODUCT_STATUSES).default("DRAFT"),
    isFeatured: z.boolean().default(false),
    isNewArrival: z.boolean().default(false),

    seo: seoInput.optional(),
    hsnCode: z.string().trim().max(12).optional(),
    /** Verify with an accountant — see the note on the model. */
    gstPercent: z.number().min(0).max(28).default(3),
  })
  .strict()
  .refine(
    (value) => new Set(value.variants.map((variant) => variant.sku)).size === value.variants.length,
    { message: "Variant SKUs must be unique within a product", path: ["variants"] },
  );

export const updateProductSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    slug: slug.optional(),
    shortDescription: z.string().trim().max(300).optional(),
    description: z.string().trim().max(8000).optional(),
    categoryIds: z.array(objectId).min(1).max(10).optional(),
    collectionIds: z.array(objectId).max(20).optional(),
    brand: z.string().trim().max(60).optional(),
    variants: z.array(variantInput).min(1).max(60).optional(),
    images: z.array(imageInput).max(15).optional(),
    videoUrl: z.url().optional(),
    pricePaise: paise.min(1, "Give the product a price").optional(),
    compareAtPricePaise: paise.nullable().optional(),
    attributes: z
      .object({
        gender: z.enum(GENDERS).optional(),
        occasions: z.array(z.enum(OCCASIONS)).max(7).optional(),
        style: z.string().trim().max(60).optional(),
        finish: z.string().trim().max(60).optional(),
        certification: z.string().trim().max(120).optional(),
      })
      .strict()
      .optional(),
    tags: z.array(z.string().trim().max(40)).max(25).optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    isFeatured: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    seo: seoInput.optional(),
    hsnCode: z.string().trim().max(12).optional(),
    gstPercent: z.number().min(0).max(28).optional(),
  })
  .strict();

/**
 * The storefront listing query.
 *
 * Sort is an enum rather than a free-form field name: accepting
 * `?sort=passwordHash` would let a caller order by — and thereby probe — any
 * field in the collection.
 */
export const listProductsSchema = z
  .object({
    ...pagination.shape,
    q: z.string().trim().max(120).optional(),
    category: csvArray.optional(),
    collection: csvArray.optional(),
    colour: csvArray.optional(),
    gender: csvArray.optional(),
    occasion: csvArray.optional(),
    tag: csvArray.optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    inStock: booleanFlag.optional(),
    featured: booleanFlag.optional(),
    newArrival: booleanFlag.optional(),
    sort: z
      .enum(["relevance", "newest", "price_asc", "price_desc", "rating", "popular"])
      .default("newest"),
    /** Admin-only; ignored for public callers by the service. */
    status: z.enum(PRODUCT_STATUSES).optional(),
  })
  .strict()
  .refine(
    (value) => value.minPrice == null || value.maxPrice == null || value.maxPrice >= value.minPrice,
    { message: "maxPrice must be at least minPrice", path: ["maxPrice"] },
  );

export type ListProductsQuery = z.infer<typeof listProductsSchema>;

export const updateStockSchema = z
  .object({
    variantId: objectId,
    /** Absolute value, not a delta — a delta applied twice is silent drift. */
    stock: z.number().int().min(0),
  })
  .strict();

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const uploadSignatureSchema = z
  .object({
    folder: z
      .enum(["product", "category", "collection", "banner", "blog", "review", "avatar"])
      .default("product"),
  })
  .strict();

/** Media library browse, for reusing an image already attached somewhere. */
export const listMediaSchema = z
  .object({
    /** Matches the *owner's* name (product title, category name), not the file. */
    search: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(60),
  })
  .strict();

/**
 * An image supplied by pasting a URL rather than uploading.
 *
 * The escape hatch for assets already sitting in Cloudinary that the catalogue
 * has never referenced — including anything uploaded by another project sharing
 * the account. Validated as a real URL so a typo becomes a 400 rather than a
 * broken `<img>` discovered on the storefront.
 */
export const importImageSchema = z
  .object({
    url: z.url().max(600),
    alt: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
