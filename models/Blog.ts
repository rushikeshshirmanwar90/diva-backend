import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, imageSchema, seoSchema } from "@/models/base";
import type { ImageRef, SeoMeta } from "@/models/base";
import { CONTENT_STATUSES, type ContentStatus } from "@/models/enums";

/**
 * Blog posts — care guides, buying advice, trend pieces.
 *
 * Content marketing is how a jewellery store ranks for "how to choose a
 * solitaire" and captures a customer months before they are ready to buy.
 *
 * **Security note on `contentHtml`:** this is the one field in the entire
 * system rendered with `dangerouslySetInnerHTML`. It must be sanitised
 * server-side with `isomorphic-dompurify` before it is stored, not on the way
 * out — sanitising at render time means every future render path has to
 * remember to do it, and one that forgets is a stored-XSS hole that runs in
 * every visitor's browser.
 */

export interface BlogDocument {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  excerpt?: string;
  /** Sanitised HTML. See the note above. */
  contentHtml: string;
  coverImage?: ImageRef;

  authorId: Types.ObjectId;
  authorName: string;

  tags: string[];
  category?: string;
  /** Products to surface inline — the commercial point of the post. */
  relatedProductIds: Types.ObjectId[];

  status: ContentStatus;
  publishedAt?: Date | null;
  readingMinutes: number;
  viewCount: number;

  seo?: SeoMeta;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const blogSchema = new mongoose.Schema<BlogDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    excerpt: { type: String, trim: true, maxlength: 400 },
    contentHtml: { type: String, required: true },
    coverImage: { type: imageSchema },

    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    /** Denormalised so a listing page needs no join per row. */
    authorName: { type: String, required: true, trim: true },

    tags: { type: [String], default: [], index: true },
    category: { type: String, trim: true, maxlength: 60 },
    relatedProductIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      default: [],
    },

    status: { type: String, enum: CONTENT_STATUSES, default: "DRAFT", required: true },
    publishedAt: { type: Date, default: null },
    readingMinutes: { type: Number, default: 1, min: 1 },
    viewCount: { type: Number, default: 0, min: 0 },

    seo: { type: seoSchema },
    deletedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

blogSchema.index({ slug: 1 }, { unique: true });
blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ title: "text", excerpt: "text", tags: "text" });

export const BlogModel: Model<BlogDocument> = defineModel("Blog", blogSchema);
