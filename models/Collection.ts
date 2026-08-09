import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, imageSchema, seoSchema } from "@/models/base";
import type { ImageRef, SeoMeta } from "@/models/base";

/**
 * Merchandising collections — Wedding, Festival, Daily Wear, Limited Edition.
 *
 * Distinct from categories: a category says *what an item is* (a ring), a
 * collection says *why you would buy it now* (it is bridal season). One product
 * belongs to exactly one category tree but any number of collections, and
 * collections are time-boxed while categories are permanent.
 *
 * Membership is stored as `productIds[]` on this side rather than as
 * `collectionIds[]` on the product, because campaigns are curated as a list
 * ("put these 40 pieces in the Diwali edit") and reordered as a list. The
 * product side keeps a mirrored array for filtered listing; the collection
 * service maintains both.
 */

export interface CollectionDocument {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  productIds: Types.ObjectId[];
  bannerImage?: ImageRef;
  mobileBannerImage?: ImageRef;
  displayOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  /** Optional campaign window. Null on both sides means always on. */
  startsAt?: Date | null;
  endsAt?: Date | null;
  seo?: SeoMeta;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const collectionSchema = new mongoose.Schema<CollectionDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 2000 },

    productIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      default: [],
    },

    bannerImage: { type: imageSchema },
    mobileBannerImage: { type: imageSchema },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },

    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },

    seo: { type: seoSchema },

    deletedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

collectionSchema.index({ slug: 1 }, { unique: true });
collectionSchema.index({ isActive: 1, displayOrder: 1 });
/** Finds campaigns live right now without scanning the collection. */
collectionSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

/**
 * Whether the campaign is live at a given moment.
 *
 * A method rather than a stored boolean: a stored flag needs a cron job to flip
 * it, and the window between the campaign ending and the job running is a
 * period where expired banners are still on the homepage.
 */
collectionSchema.methods.isLive = function isLive(this: CollectionDocument, at = new Date()) {
  if (!this.isActive || this.deletedAt) return false;
  if (this.startsAt && at < this.startsAt) return false;
  if (this.endsAt && at > this.endsAt) return false;
  return true;
};

export const CollectionModel: Model<CollectionDocument> = defineModel(
  "Collection",
  collectionSchema,
);
