import mongoose, { type Model, type Types } from "mongoose";
import { defineModel } from "@/models/base";

/**
 * Rate-limit counters.
 *
 * Shared state, because PM2 cluster mode means several processes serve the same
 * limit and an in-process counter would multiply every threshold by the core
 * count. See lib/api/rate-limit.ts for the full reasoning.
 */

export interface RateLimitDocument {
  _id: Types.ObjectId;
  /** `<rule>:<identifier>`, e.g. `login:priya@example.com`. */
  key: string;
  windowStart: Date;
  count: number;
  expiresAt: Date;
}

const rateLimitSchema = new mongoose.Schema<RateLimitDocument>(
  {
    key: { type: String, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, default: 0, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

/** One counter per key per window; the upsert relies on this being unique. */
rateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });

/** Expired windows clean themselves up; nothing sweeps this collection. */
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitModel: Model<RateLimitDocument> = defineModel(
  "RateLimit",
  rateLimitSchema,
);
