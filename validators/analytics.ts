import { z } from "zod";

/**
 * Storefront analytics beacons.
 *
 * Public and unauthenticated, so every field is bounded. `visitorId` is the
 * storefront's own random id — constrained to the alphabet `crypto.randomUUID`
 * and base64url produce so an arbitrary string cannot be stored against a
 * product.
 */
export const productViewSchema = z
  .object({
    visitorId: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, "Not a valid visitor id"),
    /** Full `document.referrer`; only its hostname is kept. */
    referrer: z.string().trim().max(2000).optional(),
  })
  .strict();

export type ProductViewInput = z.infer<typeof productViewSchema>;
