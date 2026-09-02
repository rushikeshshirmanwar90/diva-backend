import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions } from "@/models/base";

/**
 * Editable legal/informational policy pages — shipping and returns today.
 *
 * These used to be hardcoded copy in diva-frontend (`lib/data/policies.ts`).
 * One document per slug, seeded on first read with that same copy (see
 * `repositories/policy.repository.ts`), so an admin edits real content
 * instead of starting from a blank page.
 */

export const POLICY_SLUGS = ["shipping", "returns", "privacy", "terms"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export interface PolicySection {
  heading: string;
  /** Paragraphs, rendered one per `<p>`. */
  body: string[];
}

export interface PolicyDocument {
  _id: Types.ObjectId;
  slug: PolicySlug;
  title: string;
  intro: string;
  sections: PolicySection[];
  createdAt: Date;
  updatedAt: Date;
}

const policySectionSchema = new mongoose.Schema<PolicySection>(
  {
    heading: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: [String], required: true, default: [] },
  },
  { _id: false },
);

const policySchema = new mongoose.Schema<PolicyDocument>(
  {
    slug: { type: String, enum: POLICY_SLUGS, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    intro: { type: String, required: true, trim: true, maxlength: 600 },
    sections: { type: [policySectionSchema], default: [] },
  },
  baseSchemaOptions,
);

policySchema.index({ slug: 1 }, { unique: true });

export const PolicyModel: Model<PolicyDocument> = defineModel("Policy", policySchema);
