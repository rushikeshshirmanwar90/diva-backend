import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, imageSchema } from "@/models/base";
import type { ImageRef } from "@/models/base";

/**
 * Slides for the storefront homepage hero carousel.
 *
 * Deliberately its own collection rather than a `Setting` field: a settings
 * document is a singleton and awkward to hold a *list* that gets reordered,
 * added to and removed from independently — exactly what a hero rotation
 * needs. `displayOrder` plus `isActive` gives merchandising the same
 * on/off-without-deleting control as categories and collections already have.
 */

export type HeroCta = { label: string; href: string };

export interface HeroSlideDocument {
  _id: Types.ObjectId;
  heading: string;
  subtitle: string;
  image: ImageRef;
  cta: HeroCta;
  displayOrder: number;
  isActive: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ctaSchema = new mongoose.Schema<HeroCta>(
  {
    label: { type: String, required: true, trim: true, maxlength: 40 },
    /**
     * A page path, not a free-form URL — the admin form picks it from a
     * fixed dropdown of the storefront's own sections (see
     * `HERO_LINK_OPTIONS` in `validators/hero.ts`), so this never points
     * off-site or at a typo'd route.
     */
    href: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const heroSlideSchema = new mongoose.Schema<HeroSlideDocument>(
  {
    heading: { type: String, required: true, trim: true, maxlength: 160 },
    subtitle: { type: String, required: true, trim: true, maxlength: 200 },

    image: { type: imageSchema, required: true },

    cta: { type: ctaSchema, required: true },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },

    deletedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

/** The storefront read: active, undeleted, in display order. */
heroSlideSchema.index({ isActive: 1, deletedAt: 1, displayOrder: 1 });

export const HeroSlideModel: Model<HeroSlideDocument> = defineModel(
  "HeroSlide",
  heroSlideSchema,
);
