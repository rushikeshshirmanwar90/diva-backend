import { z } from "zod";
import { imageInput } from "@/validators/common";
import { HERO_LINK_OPTIONS } from "@/lib/hero-links";

const HERO_LINK_HREFS = HERO_LINK_OPTIONS.map((option) => option.href) as [
  string,
  ...string[],
];

const heroCtaSchema = z
  .object({
    label: z.string().trim().min(1, "Give the button a label").max(40),
    href: z.enum(HERO_LINK_HREFS, { message: "Choose a destination from the list" }),
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
