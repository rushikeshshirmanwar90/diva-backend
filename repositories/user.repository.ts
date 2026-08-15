import { UserModel, type UserDocument } from "@/models/User";
import { notDeleted } from "@/models/base";
import type { Role } from "@/models/enums";
import type { QueryFilter, Types } from "mongoose";

/**
 * The only module that queries the Users collection.
 *
 * Services call these functions; nothing above the repository layer imports a
 * Mongoose model. The value of that rule shows up when a query needs changing —
 * adding a soft-delete condition, say — because there is exactly one place to
 * change it rather than every route that happens to look up a user.
 *
 * Return values are plain objects (`.lean()`), not hydrated documents. Handing
 * a Mongoose document to a service leaks `.save()` upward and lets business
 * logic write to the database from anywhere.
 */

export type LeanUser = Omit<UserDocument, "_id"> & { _id: Types.ObjectId };

export async function findById(id: string) {
  return UserModel.findOne({ _id: id, ...notDeleted }).lean();
}

export async function findByEmail(email: string) {
  return UserModel.findOne({ email: email.toLowerCase(), ...notDeleted }).lean();
}

/**
 * Email lookup including the password hash.
 *
 * A separate function rather than a flag on `findByEmail`, because the hash is
 * `select: false` for a reason and every place that lifts that should be
 * visible in a grep for this function name. There is exactly one legitimate
 * caller: the login service.
 */
export async function findByEmailWithSecrets(email: string) {
  return UserModel.findOne({ email: email.toLowerCase(), ...notDeleted })
    .select("+passwordHash +otpHash +otpExpiresAt +otpAttempts")
    .lean();
}

/** The other lifted-`select` case: verifying a current password on change. */
export async function findByIdWithSecrets(id: string) {
  return UserModel.findOne({ _id: id, ...notDeleted }).select("+passwordHash").lean();
}

export async function findByResetToken(tokenHash: string) {
  return UserModel.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
    ...notDeleted,
  })
    .select("+passwordResetTokenHash +passwordResetExpiresAt")
    .lean();
}

export async function findByGoogleId(googleId: string) {
  return UserModel.findOne({ googleId, ...notDeleted }).lean();
}

/**
 * Attaches a Google identity to an account that registered with a password.
 *
 * Same person signing in a second way, not a new account — the uniqueness
 * index on `googleId` (sparse) means this throws a duplicate-key error if that
 * Google identity is already linked to someone else.
 */
export async function linkGoogleId(id: string, googleId: string) {
  return UserModel.findByIdAndUpdate(
    id,
    { $set: { googleId } },
    { returnDocument: 'after' },
  ).lean();
}

export async function create(input: {
  name: string;
  email: string;
  passwordHash?: string;
  phone?: string;
  role?: Role;
  marketingOptIn?: boolean;
  googleId?: string;
  avatarUrl?: string;
  emailVerifiedAt?: Date;
  otpHash?: string;
  otpExpiresAt?: Date;
}) {
  const user = await UserModel.create(input);
  return user.toObject();
}

export async function updateById(id: string, update: Partial<UserDocument>) {
  return UserModel.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
}

/** Sets a new OTP and resets the attempt counter for the new code. */
export async function setOtp(id: string, otpHash: string, expiresAt: Date) {
  await UserModel.updateOne(
    { _id: id },
    { $set: { otpHash, otpExpiresAt: expiresAt, otpAttempts: 0 } },
  );
}

export async function incrementOtpAttempts(id: string) {
  const result = await UserModel.findByIdAndUpdate(
    id,
    { $inc: { otpAttempts: 1 } },
    { returnDocument: 'after', projection: "otpAttempts" },
  )
    .select("+otpAttempts")
    .lean();

  return result?.otpAttempts ?? 0;
}

export async function markEmailVerified(id: string) {
  await UserModel.updateOne(
    { _id: id },
    {
      $set: { emailVerifiedAt: new Date() },
      $unset: { otpHash: "", otpExpiresAt: "", otpAttempts: "" },
    },
  );
}

/**
 * Changes a password and invalidates every existing session in one write.
 *
 * The `$inc` on `tokenVersion` is the important half. A password change that
 * leaves old access tokens working means an attacker who stole a session keeps
 * it for another fifteen minutes after the victim has locked them out — which
 * is exactly the window in which the victim believes they are safe.
 */
export async function setPassword(id: string, passwordHash: string) {
  await UserModel.updateOne(
    { _id: id },
    {
      $set: { passwordHash },
      $inc: { tokenVersion: 1 },
      $unset: { passwordResetTokenHash: "", passwordResetExpiresAt: "" },
    },
  );
}

export async function setResetToken(id: string, tokenHash: string, expiresAt: Date) {
  await UserModel.updateOne(
    { _id: id },
    { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt } },
  );
}

export async function recordLogin(id: string) {
  await UserModel.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } });
}

/** "Log out everywhere" — see the note on `tokenVersion` in the model. */
export async function bumpTokenVersion(id: string) {
  await UserModel.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
}

export async function list(options: {
  page: number;
  limit: number;
  role?: Role;
  search?: string;
}) {
  const filter: QueryFilter<UserDocument> = { ...notDeleted };

  if (options.role) filter.role = options.role;

  if (options.search) {
    // Escaped before it reaches a regex: an unescaped search term containing
    // `(a+)+$` is a catastrophic-backtracking DoS against your own database.
    const escaped = options.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  return { items, total };
}

export async function softDelete(id: string) {
  await UserModel.updateOne(
    { _id: id },
    { $set: { deletedAt: new Date(), isActive: false }, $inc: { tokenVersion: 1 } },
  );
}

export async function countByRole(role: Role) {
  return UserModel.countDocuments({ role, ...notDeleted });
}
