import { z } from "zod";
import { phone, pincode } from "@/validators/common";
import { ADDRESS_TYPES } from "@/models/enums";

/**
 * Address input.
 *
 * `userId` is never accepted here — it comes from the session in the
 * controller, the same reason `createReviewSchema` will not take one. An
 * address a client could attach to any account would let one customer read or
 * ship to another's saved address.
 */
export const addressInputSchema = z
  .object({
    label: z.string().trim().max(40).optional(),
    type: z.enum(ADDRESS_TYPES).default("HOME"),
    fullName: z.string().trim().min(2, "Name is too short").max(80),
    phone,
    alternatePhone: phone.optional(),
    line1: z.string().trim().min(1, "Address line is required").max(200),
    line2: z.string().trim().max(200).optional(),
    landmark: z.string().trim().max(120).optional(),
    city: z.string().trim().min(1, "City is required").max(80),
    state: z.string().trim().min(1, "State is required").max(80),
    pincode,
    country: z.string().trim().max(60).default("India"),
    isDefault: z.boolean().default(false),
  })
  .strict();

export type AddressInput = z.infer<typeof addressInputSchema>;

/** Every field optional for a partial edit — still `.strict()` against typos. */
export const updateAddressSchema = addressInputSchema.partial().strict();

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
