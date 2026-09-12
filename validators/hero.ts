import { z } from "zod";
import { imageInput } from "@/validators/common";
import { isHeroLinkHref } from "@/lib/hero-links";

/**
 * Was `z.enum(HERO_LINK_OPTIONS)`. It cannot stay an enum now that slides may
 * link to a category, because the valid set is rows in a collection rather
 * than a constant — so this checks the *shape* (a known section, or a
 * well-formed `/category/<slug>` path) and `heroSlide.service.ts` confirms the
 * category actually exists. The schema alone would accept a slug for a
 * category that was never created or has since been deleted.
 */
const heroHrefSchema = z
  .string()
  .trim()
  .max(300)
  .refine(isHeroLinkHref, { message: "Choose a destination from the list" });

const heroCtaSchema = z
  .object({
    label: z.string().trim().min(1, "Give the button a label").max(40),
    href: heroHrefSchema,
  })
  .strict();

export const createHeroSlideSchema = z
  .object({
    heading: z.string().trim().min(1, "Give the slide a title").max(160),
    subtitle: z.string().trim().min(1, "Give the slide a subtitle").max(200),
    image: imageInput,
    cta: heroCtaSchema,
    displayOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateHeroSlideInput = z.infer<typeof createHeroSlideSchema>;

export const updateHeroSlideSchema = z
  .object({
    heading: z.string().trim().min(1).max(160).optional(),
    subtitle: z.string().trim().min(1).max(200).optional(),
    image: imageInput.optional(),
    cta: heroCtaSchema.optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateHeroSlideInput = z.infer<typeof updateHeroSlideSchema>;
