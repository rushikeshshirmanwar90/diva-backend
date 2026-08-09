import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, imageSchema, seoSchema } from "@/models/base";
import type { ImageRef, SeoMeta } from "@/models/base";

/**
 * Catalogue categories — Rings, Necklaces, Earrings, and so on.
 *
 * Self-referential tree via `parentId`, so "Rings → Engagement Rings" needs no
 * second collection. `ancestorIds` denormalises the full path so that listing
 * every product under a top-level category is one indexed query rather than a
 * recursive walk — the read is thousands of times more frequent than the write
 * that maintains it.
 */

export interface CategoryDocument {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  parentId?: Types.ObjectId | null;
  /** Root-first path, excluding self. Maintained by the category service. */
  ancestorIds: Types.ObjectId[];
  image?: ImageRef;
  /** Wide hero for the category landing page, distinct from the grid tile. */
  bannerImage?: ImageRef;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  /** Denormalised count of active products, refreshed on catalogue writes. */
  productCount: number;
  seo?: SeoMeta;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new mongoose.Schema<CategoryDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 2000 },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    ancestorIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      default: [],
      index: true,
    },

    image: { type: imageSchema },
    bannerImage: { type: imageSchema },
    /** Lucide icon name, for nav rendering without an image round-trip. */
    icon: { type: String, trim: true, maxlength: 40 },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    productCount: { type: Number, default: 0, min: 0 },

    seo: { type: seoSchema },

    deletedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

categorySchema.index({ slug: 1 }, { unique: true });

/** Drives the nav and category-grid queries: active, ordered, top-level first. */
categorySchema.index({ isActive: 1, displayOrder: 1, name: 1 });
categorySchema.index({ parentId: 1, displayOrder: 1 });

export const CategoryModel: Model<CategoryDocument> = defineModel("Category", categorySchema);
