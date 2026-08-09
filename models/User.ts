import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions } from "@/models/base";
import { ROLES, type Role } from "@/models/enums";

/**
 * Customers and staff, in one collection.
 *
 * One collection rather than two because the distinction is a role, not a
 * different kind of entity — and because a staff member who also shops should
 * not need two accounts. Every authorisation decision reads `role`; nothing
 * infers privilege from which collection a document came out of.
 */

export interface UserDocument {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  /** Absent for Google-only accounts, which have no password to check. */
  passwordHash?: string;
  role: Role;
  /**
   * Bumped to invalidate every outstanding access token for this user at once.
   *
   * Access tokens are stateless and live up to 15 minutes, so there is no
   * session row to delete. Comparing the token's `tokenVersion` against this
   * field on each request is what makes "log out everywhere", a forced password
   * reset, and an account ban take effect immediately rather than a quarter of
   * an hour later.
   */
  tokenVersion: number;
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  googleId?: string;
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  /** Hashed OTP for email verification; never the OTP itself. */
  otpHash?: string;
  otpExpiresAt?: Date;
  otpAttempts: number;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  marketingOptIn: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    /**
     * Stored E.164-ish (`+919876543210`).
     *
     * The unique+sparse index is declared once, below. `sparse: true` here as
     * well would be a second, *non-unique* `phone_1` — Mongoose treats an index
     * option in a field definition as an index declaration, so the two race and
     * whichever loses leaves the constraint silently missing.
     */
    phone: { type: String, trim: true },

    /**
     * bcrypt hash. `select: false` keeps it out of every query result unless a
     * caller explicitly asks — so a careless `res.json(user)` cannot leak it.
     */
    passwordHash: { type: String, select: false },

    role: { type: String, enum: ROLES, default: "customer", required: true, index: true },

    tokenVersion: { type: Number, default: 0, required: true },

    emailVerifiedAt: { type: Date },
    phoneVerifiedAt: { type: Date },

    /** Same as `phone`: the unique+sparse index is declared once, below. */
    googleId: { type: String, select: false },

    avatarUrl: { type: String, trim: true },

    /** Cleared by an admin to suspend an account without deleting its orders. */
    isActive: { type: Boolean, default: true, required: true },

    lastLoginAt: { type: Date },

    otpHash: { type: String, select: false },
    otpExpiresAt: { type: Date, select: false },
    /** Caps brute-forcing a 6-digit code that is only 1-in-a-million to guess. */
    otpAttempts: { type: Number, default: 0, select: false },

    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },

    marketingOptIn: { type: Boolean, default: false },

    deletedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

/**
 * Case-insensitive uniqueness on email.
 *
 * The field is already lowercased on write, so this is belt-and-braces against
 * a path that bypasses the setter (a raw `updateOne`, a migration script).
 * Without it, `Priya@x.com` and `priya@x.com` become two accounts, and the
 * customer cannot work out which one holds their orders.
 */
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ createdAt: -1 });

/** Admin user search. */
userSchema.index({ name: "text", email: "text" });

export const UserModel: Model<UserDocument> = defineModel("User", userSchema);
