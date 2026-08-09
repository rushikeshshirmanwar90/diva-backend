import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { readAccessCookie, type Audience } from "@/lib/auth/cookies";
import { assertCsrf } from "@/lib/auth/csrf";
import { assertCan, type Permission } from "@/lib/auth/rbac";
import { UserModel } from "@/models/User";
import type { Role } from "@/models/enums";

/**
 * Principal resolution — written once, used by every protected route.
 *
 * Three clients authenticate three different ways, and this is the single place
 * that difference is reconciled:
 *
 *   mobile      → `Authorization: Bearer <jwt>`
 *   storefront  → `diva_at` httpOnly cookie
 *   admin UI    → `diva_admin_at` httpOnly cookie
 *
 * Everything downstream sees one `Principal` and never learns which transport
 * it arrived on. Re-deriving this per route is how authenticated pages start
 * intermittently behaving as logged-out.
 *
 * The transport does have one consequence that cannot be hidden: **CSRF applies
 * to cookies and not to bearer tokens.** That decision is made here, from the
 * resolved transport, so no individual route has to remember it.
 */

export type Principal = {
  userId: string;
  email: string;
  role: Role;
  transport: "bearer" | "cookie";
  audience: Audience;
};

/**
 * Resolves the caller, or returns null when unauthenticated.
 *
 * Used by endpoints that serve both — a product page that shows wishlist state
 * when signed in and plain content when not.
 */
export async function getPrincipal(request: NextRequest): Promise<Principal | null> {
  const resolved = await readToken(request);
  if (!resolved) return null;

  let claims;
  try {
    claims = await verifyAccessToken(resolved.token);
  } catch {
    // An expired or invalid token on an optional-auth route means "anonymous",
    // not "error". The client will refresh when it makes an authenticated call.
    return null;
  }

  const user = await loadAndValidateUser(claims.sub, claims.tokenVersion);
  if (!user) return null;

  return {
    userId: String(user._id),
    email: user.email,
    role: user.role,
    transport: resolved.transport,
    audience: resolved.audience,
  };
}

/**
 * Resolves the caller, or throws 401.
 *
 * Also enforces CSRF for cookie-authenticated mutations. Doing it here rather
 * than in each route means a new endpoint is protected by default instead of by
 * remembering.
 */
export async function requireAuth(request: NextRequest): Promise<Principal> {
  const resolved = await readToken(request);

  if (!resolved) {
    throw ApiError.unauthenticated("Sign in to continue");
  }

  // Throws with TOKEN_EXPIRED vs UNAUTHENTICATED so the client knows whether
  // to refresh or to re-login.
  const claims = await verifyAccessToken(resolved.token);

  const user = await loadAndValidateUser(claims.sub, claims.tokenVersion);

  if (!user) {
    throw ApiError.unauthenticated("Your session is no longer valid. Please sign in again.");
  }

  if (resolved.transport === "cookie") {
    await assertCsrf(request);
  }

  return {
    userId: String(user._id),
    email: user.email,
    role: user.role,
    transport: resolved.transport,
    audience: resolved.audience,
  };
}

/** Requires a signed-in caller holding a specific permission. */
export async function requirePermission(
  request: NextRequest,
  permission: Permission,
): Promise<Principal> {
  const principal = await requireAuth(request);
  assertCan(principal.role, permission);
  return principal;
}

/**
 * Requires staff, and requires that they arrived through the admin surface.
 *
 * The audience check is the point: a storefront cookie belonging to a user who
 * happens to be an admin must not authorise admin actions. Otherwise an XSS on
 * the public storefront escalates straight into the back office, because the
 * storefront cookie is scoped to `.diva.com` while the admin cookie is not.
 */
export async function requireStaff(
  request: NextRequest,
  permission: Permission,
): Promise<Principal> {
  const principal = await requireAuth(request);

  if (principal.transport === "cookie" && principal.audience !== "admin") {
    throw ApiError.forbidden("Admin actions must be performed from the admin console.");
  }

  if (principal.role === "customer") {
    throw ApiError.forbidden("This area is restricted to staff accounts.");
  }

  assertCan(principal.role, permission);
  return principal;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function readToken(
  request: NextRequest,
): Promise<{ token: string; transport: "bearer" | "cookie"; audience: Audience } | null> {
  const header = request.headers.get("authorization");

  // Bearer wins when both are present. An explicit header is a deliberate act;
  // a cookie is ambient and may just be left over in the jar.
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return { token, transport: "bearer", audience: "storefront" };
  }

  const cookie = await readAccessCookie();
  if (cookie) return { token: cookie.token, transport: "cookie", audience: cookie.audience };

  return null;
}

/**
 * Loads the user and re-checks the things a stateless token cannot know.
 *
 * This is the one database read on the authenticated path, and it is what buys
 * back the revocation that JWTs give up:
 *
 *  - `tokenVersion` mismatch → the token was issued before a "log out
 *    everywhere", a password change, or a ban. Reject it.
 *  - `isActive` false or soft-deleted → the account was suspended after the
 *    token was minted.
 *
 * Without this check, a suspended account keeps full access for up to fifteen
 * minutes, which is fifteen minutes too long for an account you just banned for
 * fraud.
 */
async function loadAndValidateUser(userId: string, tokenVersion: number) {
  const user = await UserModel.findById(userId)
    .select("email role tokenVersion isActive deletedAt")
    .lean();

  if (!user) return null;
  if (!user.isActive || user.deletedAt) return null;
  if (user.tokenVersion !== tokenVersion) return null;

  return user;
}
