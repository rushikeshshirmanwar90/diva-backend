import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, imageSchema, seoSchema, paiseField } from "@/models/base";
import type { ImageRef, SeoMeta } from "@/models/base";
import {
  GENDERS,
  OCCASIONS,
  PRODUCT_STATUSES,
  type Gender,
  type Occasion,
  type ProductStatus,
} from "@/models/enums";

/**
 * Products, as parent + variants.
 *
 * A ring is **one** product with a `variants[]` array keyed by colour and size
 * — not fourteen products that happen to share a name. SKU and stock live on
 * the variant; title, images, description, category **and price** live on the
 * parent.
 *
 * Price sits on the product rather than the variant because this catalogue is
 * fixed-price 1-gram-gold: a design costs what it costs, and choosing rose gold
 * over gold does not change the number. If a finish ever needs its own price
 * that is a `pricePaise` moved down one level, not a restructure.
 *
 * The alternative shape — a flat product-per-SKU table — breaks the product
 * detail page, the review model, and every "also available in" affordance.
 * Restructuring this later means migrating orders, carts, wishlists and reviews
 * simultaneously, so it is worth getting right once.
 */

// ---------------------------------------------------------------------------
// Variant
// ---------------------------------------------------------------------------

/**
 * A buyable option: one colour, one size, one SKU, its own stock.
 *
 * `reservedStock` and `isActive` are system-owned — no admin form writes them.
 * Everything else here is typed by hand in the product editor.
 */
export interface Variant {
  _id: Types.ObjectId;
  sku: string;
  /**
   * Plating or finish, as an `UPPER_SNAKE` token — `GOLD`, `ROSE_GOLD`, or
   * anything else an admin typed. Normalised by `toColourValue` on the way in;
   * see `lib/colour.ts` for why it is not an enum.
   */
  colour: string;
  /** Ring size, chain length, bangle diameter — free-form by category. */
  size?: string;

  stock: number;
  /** Units held by unpaid carts. Available stock is `stock - reserved`. */
  reservedStock: number;
  lowStockThreshold: number;

  /** Overrides the product gallery where present — a rose-gold shot. */
  images: ImageRef[];
  isActive: boolean;
}

const variantSchema = new mongoose.Schema<Variant>(
  {
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    colour: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    size: { type: String, trim: true, maxlength: 24 },

    stock: { type: Number, default: 0, min: 0, required: true },
    reservedStock: { type: Number, default: 0, min: 0, required: true },
    lowStockThreshold: { type: Number, default: 2, min: 0 },

    images: { type: [imageSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export interface ProductDocument {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  shortDescription?: string;
  description?: string;

  categoryIds: Types.ObjectId[];
  collectionIds: Types.ObjectId[];
  brand: string;

  variants: Variant[];
  images: ImageRef[];
  videoUrl?: string;

  attributes: {
    gender?: Gender;
    occasions: Occasion[];
    style?: string;
    finish?: string;
    certification?: string;
  };

  tags: string[];

  /**
   * What one unit costs, before GST, in paise.
   *
   * Typed by an admin and stored — not computed. It is the single source of
   * price for the listing, the product page, the cart and the invoice, so
   * "sort by price" and "filter ₹500-₹2000" are index-backed reads of this
   * exact field rather than a per-request recomputation.
   */
  pricePaise: number;

  /** Strike-through "was" price. Purely presentational, never computed from. */
  compareAtPricePaise?: number | null;

  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  viewCount: number;

  status: ProductStatus;
  isFeatured: boolean;
  isNewArrival: boolean;
  publishedAt?: Date;

  seo?: SeoMeta;

  hsnCode?: string;
  /** GST percent for this item. Confirm rates with an accountant, not a blog. */
  gstPercent: number;

  createdBy?: Types.ObjectId;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new mongoose.Schema<ProductDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    shortDescription: { type: String, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 8000 },

    categoryIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      default: [],
      required: true,
    },
    collectionIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Collection" }],
      default: [],
    },
    brand: { type: String, trim: true, default: "DIVA", maxlength: 60 },

    variants: {
      type: [variantSchema],
      default: [],
      validate: {
        validator: (variants: Variant[]) => variants.length > 0,
        message: "A product needs at least one variant",
      },
    },

    /** Gallery shared by all variants; variant images override where present. */
    images: { type: [imageSchema], default: [] },
    videoUrl: { type: String, trim: true },

    attributes: {
      gender: { type: String, enum: GENDERS },
      occasions: { type: [{ type: String, enum: OCCASIONS }], default: [] },
      style: { type: String, trim: true, maxlength: 60 },
      finish: { type: String, trim: true, maxlength: 60 },
      certification: { type: String, trim: true, maxlength: 120 },
    },

    tags: { type: [String], default: [], index: true },

    pricePaise: paiseField({ default: 0, required: true }),
    compareAtPricePaise: { ...paiseField(), default: null },

    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: PRODUCT_STATUSES, default: "DRAFT", required: true },
    isFeatured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    publishedAt: { type: Date },

    seo: { type: seoSchema },

    hsnCode: { type: String, trim: true, maxlength: 12 },
    /**
     * 3% is the common rate on gold jewellery. Imitation and plated jewellery
     * is generally rated higher. **Verify with your accountant** — the rate
     * varies by item and a wrong rate on every invoice is expensive to unwind.
     */
    gstPercent: { type: Number, default: 3, min: 0, max: 28 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

// --- Indexes ---------------------------------------------------------------

productSchema.index({ slug: 1 }, { unique: true });

/** SKUs must be unique across the whole catalogue, not just within a product. */
productSchema.index({ "variants.sku": 1 }, { unique: true, sparse: true });

/**
 * The workhorse for filtered category listings.
 *
 * Field order is deliberate and follows the ESR rule — **E**quality first,
 * then **S**ort, then **R**ange. `status` and `categoryIds` are equality
 * matches, `pricePaise` is the range filter and the common sort. Reordering
 * these turns an index scan into a collection scan.
 */
productSchema.index({ status: 1, deletedAt: 1, categoryIds: 1, pricePaise: 1 });
productSchema.index({ status: 1, deletedAt: 1, collectionIds: 1, pricePaise: 1 });
productSchema.index({ status: 1, deletedAt: 1, createdAt: -1 });
productSchema.index({ status: 1, isFeatured: 1, soldCount: -1 });
productSchema.index({ status: 1, "variants.colour": 1 });
productSchema.index({ ratingAvg: -1, ratingCount: -1 });
productSchema.index({ soldCount: -1 });

/**
 * Full-text search over the fields a customer actually types.
 *
 * Weighted so a title match outranks a description mention — searching "ruby"
 * should surface the Ruby Halo Ring before every product whose description
 * happens to say "pairs well with ruby".
 *
 * MongoDB text search is adequate to a few thousand products. Past that, move
 * to Atlas Search — this index is not meant to carry a large catalogue.
 */
productSchema.index(
  { title: "text", shortDescription: "text", description: "text", tags: "text" },
  {
    weights: { title: 10, tags: 6, shortDescription: 3, description: 1 },
    name: "product_search",
  },
);

// --- Virtuals --------------------------------------------------------------

/** Sellable units across all active variants. */
productSchema.virtual("availableStock").get(function availableStock(this: ProductDocument) {
  return this.variants
    .filter((variant) => variant.isActive)
    .reduce((total, variant) => total + Math.max(0, variant.stock - variant.reservedStock), 0);
});

productSchema.virtual("inStock").get(function inStock(this: ProductDocument) {
  return this.variants.some(
    (variant) => variant.isActive && variant.stock - variant.reservedStock > 0,
  );
});

export const ProductModel: Model<ProductDocument> = defineModel("Product", productSchema);
