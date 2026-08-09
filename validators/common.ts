import { z } from "zod";
import { isValidObjectId } from "mongoose";

/**
 * Shared validation primitives.
 *
 * Every schema built on these is `.strict()` at its top level, which rejects
 * unknown keys instead of stripping them. That is the mass-assignment control:
 * a registration payload carrying `"role": "superadmin"` is a 400, not a
 * silently-ignored field that some future refactor starts honouring.
 */

/**
 * A MongoDB ObjectId as a string.
 *
 * Validated here rather than passed through, because an unchecked value in a
 * query filter is the NoSQL-injection vector — `{"$ne": null}` in place of an
 * id matches every document.
 */
export const objectId = z
  .string()
  .refine((value) => isValidObjectId(value), "Must be a valid id");

export const slug = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase hyphenated slug");

export const email = z.email().max(254).toLowerCase().trim();

/** Indian mobile number, with or without the +91 prefix. */
export const phone = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const pincode = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode");

/** Whole paise. Rejects the floats that quietly corrupt money. */
export const paise = z
  .number()
  .int("Amounts must be whole paise, not fractions")
  .min(0)
  .max(1_000_000_000);

export const milligrams = z.number().int("Weights must be whole milligrams").min(0).max(10_000_000);

export const percent = z.number().min(0).max(100);

/**
 * Pagination.
 *
 * `limit` is capped at 100. Without a ceiling, `?limit=100000` is a trivially
 * available denial of service — one request that serialises the whole
 * catalogue.
 */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof pagination>;

/** Turns `?a,b,c` or repeated params into a string array. */
export const csvArray = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(","))
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const booleanFlag = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

/** An image the client uploaded to Cloudinary and is now attaching. */
export const imageInput = z.object({
  publicId: z.string().min(1).max(300),
  url: z.url(),
  alt: z.string().min(1).max(200),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  displayOrder: z.number().int().min(0).default(0),
});

export const seoInput = z
  .object({
    title: z.string().max(70).optional(),
    description: z.string().max(180).optional(),
    keywords: z.array(z.string().max(40)).max(20).optional(),
    ogImage: z.url().optional(),
  })
  .strict();

export const idParam = z.object({ id: objectId });
export const slugParam = z.object({ slug });
