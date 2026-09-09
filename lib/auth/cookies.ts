import { cookies } from "next/headers";
import { env, isProduction } from "@/config/env";
import { refreshTokenTtlDays } from "@/lib/auth/tokens";

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

  const ttlSeconds = refreshTokenTtlDays(audience) * 24 * 60 * 60;

  // Access token cookie lives for the full session duration (365 days)
  store.set(accessName, tokens.accessToken, {
    ...options,
    path: "/",
    maxAge: ttlSeconds,
  });

  // Refresh token cookie lives for the full session duration (365 days)
  store.set(refreshName, tokens.refreshToken, {
    ...options,
    path: "/",
    maxAge: ttlSeconds,
  });
}

export async function clearSessionCookies(audience: Audience): Promise<void> {
  const store = await cookies();
  const options = baseOptions(audience);

  const accessName =
    audience === "admin" ? COOKIE_NAMES.adminAccess : COOKIE_NAMES.storefrontAccess;
  const refreshName =
    audience === "admin" ? COOKIE_NAMES.adminRefresh : COOKIE_NAMES.storefrontRefresh;

  // Deleting cookies requires the same path and domain it was set with
  store.set(accessName, "", { ...options, path: "/", maxAge: 0 });
  store.set(refreshName, "", { ...options, path: "/", maxAge: 0 });
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
