import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions } from "@/models/base";

/**
 * Refresh tokens — one row per issued token, per device.
 *
 * Three design points, each of which exists to contain a specific attack:
 *
 * 1. **Stored hashed.** Only the SHA-256 digest is persisted. A database dump
 *    then yields no usable sessions. Unlike a password, the token is 256 bits
 *    of randomness, so a plain fast hash is correct here — bcrypt would add
 *    latency to every refresh for no gain against a value nobody can guess.
 *
 * 2. **Rotation.** Redeeming a token marks it used and issues a new one. A
 *    stolen token is therefore valid only until the legitimate client next
 *    refreshes.
 *
 * 3. **Family reuse detection.** All tokens descended from one login share a
 *    `familyId`. Presenting an already-redeemed token means two parties hold
 *    the same token — a theft signal — and the whole family is revoked, forcing
 *    a fresh login. This is what turns rotation from a nicety into a control.
 */

export interface RefreshTokenDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  /** Shared by every token descended from a single login. */
  familyId: string;
  /** Set when redeemed. A second presentation of a used token is theft. */
  usedAt?: Date;
  revokedAt?: Date;
  revokedReason?: "ROTATED" | "LOGOUT" | "REUSE_DETECTED" | "PASSWORD_CHANGED" | "ADMIN";
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new mongoose.Schema<RefreshTokenDocument>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true },
    familyId: { type: String, required: true, index: true },
    usedAt: { type: Date },
    revokedAt: { type: Date },
    revokedReason: {
      type: String,
      enum: ["ROTATED", "LOGOUT", "REUSE_DETECTED", "PASSWORD_CHANGED", "ADMIN"],
    },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 400 },
    ip: { type: String, maxlength: 64 },
  },
  baseSchemaOptions,
);

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });

/**
 * TTL index: Mongo deletes expired rows automatically.
 *
 * Rows are kept until natural expiry rather than deleted on rotation, because a
 * redeemed-but-unexpired row is precisely what reuse detection needs to match
 * against. Delete on rotation and a replayed token looks merely "unknown"
 * instead of "stolen", and the family is never revoked.
 *
 * Mongo's TTL monitor runs about once a minute, so removal is prompt but not
 * instantaneous — never rely on it for correctness, only for cleanup.
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel: Model<RefreshTokenDocument> = defineModel(
  "RefreshToken",
  refreshTokenSchema,
);
