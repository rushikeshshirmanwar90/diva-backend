import { RefreshTokenModel } from "@/models/RefreshToken";

/**
 * Refresh-token persistence.
 *
 * The interesting function here is `redeem`, which implements rotation with
 * reuse detection atomically. See its comment.
 */

export async function issue(input: {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
}) {
  return RefreshTokenModel.create(input);
}

/**
 * Atomically marks a token as used, returning it only if it was previously
 * unused.
 *
 * The atomicity is the whole point. A read-then-write —
 * "find the token, check `usedAt`, then set it" — has a window in which two
 * concurrent requests both read `usedAt: null` and both succeed. That window is
 * not theoretical: a mobile app firing several parallel requests after a
 * 401 hits it routinely, and the result is a legitimate user being flagged for
 * token theft and logged out.
 *
 * `findOneAndUpdate` with `usedAt: null` in the filter makes the database
 * arbitrate. Exactly one caller gets the document; everyone else gets null.
 */
export async function redeem(tokenHash: string) {
  return RefreshTokenModel.findOneAndUpdate(
    { tokenHash, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date(), revokedReason: "ROTATED" } },
    { returnDocument: 'after' },
  ).lean();
}

/**
 * Looks a token up regardless of state.
 *
 * Called after `redeem` returns null, to tell the two failure modes apart: a
 * token that never existed (someone guessing, or a stale client) versus one
 * that exists but was already used (theft — revoke the family).
 */
export async function findAnyByHash(tokenHash: string) {
  return RefreshTokenModel.findOne({ tokenHash }).lean();
}

/**
 * Revokes every token descended from one login.
 *
 * The response to detected reuse. Both copies of the stolen token are killed,
 * along with every token issued from that session, so the thief and the victim
 * are both forced to re-authenticate — and only the one who knows the password
 * can.
 */
export async function revokeFamily(familyId: string, reason: "REUSE_DETECTED" | "LOGOUT" | "ADMIN") {
  await RefreshTokenModel.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

export async function revokeAllForUser(
  userId: string,
  reason: "LOGOUT" | "PASSWORD_CHANGED" | "ADMIN",
) {
  await RefreshTokenModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

/** Active sessions, for a "signed in on these devices" screen. */
export async function listActiveForUser(userId: string) {
  return RefreshTokenModel.find({
    userId,
    revokedAt: null,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select("familyId userAgent ip createdAt expiresAt")
    .sort({ createdAt: -1 })
    .lean();
}
