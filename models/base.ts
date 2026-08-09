import mongoose, { type Model, type Schema } from "mongoose";

/**
 * Conventions shared by every model.
 */

/**
 * Registers a model idempotently.
 *
 * `next dev` re-evaluates modules on every edit, and calling `mongoose.model()`
 * twice with the same name throws `OverwriteModelError`. Checking the registry
 * first turns that into a no-op, which is the difference between a hot reload
 * and restarting the dev server after every save.
 *
 * **In development the cached model is replaced rather than reused.** The
 * mongoose instance outlives an HMR reload, so the registry holds the schema as
 * it was when the server booted. Returning that stale model means an edit to a
 * schema does nothing until someone restarts the process — and because Mongoose
 * is `strict` by default, the symptom is not an error but a *silent drop*: the
 * write succeeds, the new field simply never arrives in MongoDB. That is a
 * miserable thing to debug, and it costs a schema recompile per edit to avoid.
 *
 * Production keeps the plain cache: modules are evaluated once, so there is
 * nothing stale to replace and `deleteModel` would only add risk.
 */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  const cached = mongoose.models[name] as Model<T> | undefined;

  if (cached) {
    if (process.env.NODE_ENV !== "development") return cached;
    // Drops the compiled model *and* its cached schema, so the next line
    // rebuilds from the schema this module just evaluated.
    mongoose.deleteModel(name);
  }

  return mongoose.model<T>(name, schema);
}

/**
 * A monetary field. Always an integer count of paise.
 *
 * The `validate` is not decoration: it is the tripwire that catches the first
 * place someone assigns `price * 1.03` and produces a float. Money that goes
 * fractional in the database is far harder to find later than a write that
 * fails loudly now.
 *
 * `null` passes. Mongoose runs custom validators on null (it only skips
 * `undefined`), and a bare `Number.isInteger` rejects it — which breaks every
 * *deliberately* nullable amount, `compareAtPricePaise` among them, with a
 * message about fractions that has nothing to do with what happened. Whether a
 * value may be absent is `required`'s business, not this validator's.
 */
export const paiseField = (options: { required?: boolean; default?: number } = {}) => ({
  type: Number,
  required: options.required ?? false,
  default: options.default,
  min: 0,
  validate: {
    validator: (value: unknown) => value == null || Number.isInteger(value),
    message: "Monetary amounts must be whole paise (integers), not fractions",
  },
});

/** Weight in integer milligrams, for the same reason money is in paise. */
export const milligramField = (options: { required?: boolean } = {}) => ({
  type: Number,
  required: options.required ?? false,
  min: 0,
  validate: {
    validator: (value: unknown) => value == null || Number.isInteger(value),
    message: "Weights must be whole milligrams (integers)",
  },
});

/**
 * Standard `toJSON` transform.
 *
 * Renames `_id` to `id` and drops `__v`, so API responses never leak Mongo
 * implementation details to clients. Nothing downstream should have to know
 * which database this is.
 */
export const baseSchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
  toObject: { virtuals: true },
} as const;

/**
 * An embedded image reference.
 *
 * Stores the Cloudinary public ID rather than only the URL, because the URL is
 * derived — transformations, formats and CDN hosts all change, and a stored URL
 * freezes whatever was current when the record was written. `alt` is required
 * for accessibility and for image SEO.
 */
export const imageSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    alt: { type: String, required: true, trim: true, maxlength: 200 },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false },
);

export type ImageRef = {
  publicId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
  displayOrder: number;
};

/**
 * SEO overrides for anything with a public URL.
 *
 * Optional throughout — sensible defaults are derived from the entity's own
 * title and description. This exists for the cases where marketing wants a
 * different headline in Google than on the page.
 */
export const seoSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 70 },
    description: { type: String, trim: true, maxlength: 180 },
    keywords: { type: [String], default: undefined },
    ogImage: { type: String, trim: true },
  },
  { _id: false },
);

export type SeoMeta = {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
};

/**
 * Soft-delete filter.
 *
 * Catalogue entities are never hard-deleted, because orders reference them and
 * a hard delete orphans order history — a customer opening a two-year-old
 * invoice must still see what they bought. Every read that should exclude
 * deleted rows spreads this into its filter.
 */
export const notDeleted = { deletedAt: null } as const;
