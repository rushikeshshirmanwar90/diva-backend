import "server-only";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { COOKIE_NAMES } from "@/lib/auth/cookies";
import { connectToDatabase } from "@/lib/db/connect";
import { UserModel } from "@/models/User";
import { isStaffRole } from "@/lib/auth/rbac";
import type { AdminUser } from "@/app/admin/_lib/api";

/**
 * Server-side session read for admin pages.
 *
 * Separate from `requireAuth` in lib/auth/session.ts, which takes a
 * `NextRequest` and belongs to the API surface. Server Components have no
 * request object — they read cookies through `next/headers`, which is async in
 * Next 16.
 *
 * The checks mirror the API guard exactly, and for the same reasons: a valid
 * signature is not sufficient, because `tokenVersion` may have moved (password
 * change, "log out everywhere", a ban) since the token was minted, and the
 * account may have been suspended.
 *
 * `server-only` at the top makes importing this from a Client Component a build
 * error rather than a runtime surprise — this file can reach the database and
 * must never end up in a browser bundle.
 */
export async function getAdminSession(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAMES.adminAccess)?.value;

  if (!token) return null;

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    // Expired or malformed. The caller redirects to /admin/login, which first
    // attempts a silent refresh — the session is good for 48 hours, so an
    // expired 15-minute access token must not mean re-typing a password.
    return null;
  }

  /**
   * A dead database is reported as a plain `Error`, never as the driver's own.
   *
   * `MongooseServerSelectionError` carries `TopologyDescription` class
   * instances on it. Thrown out of a Server Component, React tries to serialise
   * that across the boundary to the client and fails with "Only plain objects
   * … can be passed to Client Components" — a second, unrelated-looking error
   * that buries the real one. The page then 500s with no usable message.
   *
   * Not swallowed and turned into `null`: that would redirect to the login page
   * and tell an admin they are signed out when in fact the database is down,
   * which sends them hunting for the wrong problem entirely.
   */
  try {
    await connectToDatabase();
  } catch (caught) {
    console.error("[admin] database unreachable while reading the session", caught);
    throw new Error("The database is unreachable. Check DB_URL and that the server is running.");
  }

  const user = await UserModel.findById(claims.sub)
    .select("name email role tokenVersion isActive deletedAt avatarUrl emailVerifiedAt")
    .lean();

  if (!user) return null;
  if (!user.isActive || user.deletedAt) return null;
  if (user.tokenVersion !== claims.tokenVersion) return null;
  if (!isStaffRole(user.role)) return null;

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    avatarUrl: user.avatarUrl,
  };
}
