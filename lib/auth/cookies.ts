import { cookies } from "next/headers";
import { env, isProduction } from "@/config/env";

/**
 * Session cookies for the two browser clients.
 *
 * The storefront and the admin UI get **different cookie names and different
 * scopes**, which is the whole point of this file:
 *
 * - Storefront: `SameSite=Lax` and `Domain=.diva.com`, so `www.diva.com` can
 *   send credentials to `api.diva.com`. Lax rather than Strict because a
 *   customer clicking through from an order-confirmation email must land
 *   already signed in.
 *
 * - Admin: `SameSite=Strict` and **host-only** (no Domain attribute), so the
 *   cookie is scoped to `admin.diva.com` alone. Strict is correct because admin
 *   has no legitimate cross-site entry point, and host-only scoping means a
 *   compromised storefront subdomain cannot read or overwrite admin
 *   credentials. A shared `.diva.com` cookie would be readable by every
 *   subdomain, including any future marketing microsite.
 *
 * The mobile app appears nowhere here — it sends `Authorization: Bearer` and
 * has no cookie jar. See lib/auth/session.ts, which resolves both.
 *
 * Next 16 note: `cookies()` is async. The synchronous shim from Next 15 has
 * been removed, so every call site awaits.
 */

export const COOKIE_NAMES = {
  storefrontAccess: "diva_at",
  storefrontRefresh: "diva_rt",
  adminAccess: "diva_admin_at",
  adminRefresh: "diva_admin_rt",
  guestCart: "diva_guest",
  csrf: "diva_csrf",
} as const;

export type Audience = "storefront" | "admin";

function baseOptions(audience: Audience) {
  return {
    httpOnly: true,
    // Browsers reject `Secure` cookies over plain http, which would silently
    // break local development on http://localhost.
    secure: isProduction,
    sameSite: audience === "admin" ? ("strict" as const) : ("lax" as const),
    path: "/",
    // Host-only for admin: no Domain attribute at all.
    ...(audience === "storefront" && env.COOKIE_DOMAIN
      ? { domain: env.COOKIE_DOMAIN }
      : {}),
  };
}

export async function setSessionCookies(
  audience: Audience,
  tokens: { accessToken: string; refreshToken: string },
): Promise<void> {
  const store = await cookies();
  const options = baseOptions(audience);

  const accessName =
    audience === "admin" ? COOKIE_NAMES.adminAccess : COOKIE_NAMES.storefrontAccess;
  const refreshName =
    audience === "admin" ? COOKIE_NAMES.adminRefresh : COOKIE_NAMES.storefrontRefresh;

  store.set(accessName, tokens.accessToken, {
    ...options,
    maxAge: 15 * 60,
  });

  /**
   * The refresh cookie is scoped to the refresh endpoint only.
   *
   * A long-lived credential should not be attached to every request to the API;
   * narrowing its path means it is only ever transmitted where it is actually
   * needed, which shrinks the surface for it to be logged or leaked.
   */
  store.set(refreshName, tokens.refreshToken, {
    ...options,
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookies(audience: Audience): Promise<void> {
  const store = await cookies();
  const options = baseOptions(audience);

  const accessName =
    audience === "admin" ? COOKIE_NAMES.adminAccess : COOKIE_NAMES.storefrontAccess;
  const refreshName =
    audience === "admin" ? COOKIE_NAMES.adminRefresh : COOKIE_NAMES.storefrontRefresh;

  // Deleting a cookie requires the same path and domain it was set with —
  // a mismatch leaves the original in place and the user stays logged in.
  store.set(accessName, "", { ...options, maxAge: 0 });
  store.set(refreshName, "", { ...options, path: "/api/v1/auth", maxAge: 0 });
}

export async function readAccessCookie(): Promise<{
  token: string;
  audience: Audience;
} | null> {
  const store = await cookies();

  const admin = store.get(COOKIE_NAMES.adminAccess)?.value;
  if (admin) return { token: admin, audience: "admin" };

  const storefront = store.get(COOKIE_NAMES.storefrontAccess)?.value;
  if (storefront) return { token: storefront, audience: "storefront" };

  return null;
}

export async function readRefreshCookie(
  audience: Audience,
): Promise<string | undefined> {
  const store = await cookies();
  return store.get(
    audience === "admin" ? COOKIE_NAMES.adminRefresh : COOKIE_NAMES.storefrontRefresh,
  )?.value;
}
