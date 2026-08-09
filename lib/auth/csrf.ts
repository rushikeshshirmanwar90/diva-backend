import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { isProduction, env } from "@/config/env";
import { COOKIE_NAMES } from "@/lib/auth/cookies";
import { safeEqual } from "@/lib/auth/tokens";

/**
 * CSRF protection, double-submit cookie pattern.
 *
 * The problem this solves exists **only** for cookie authentication: the
 * browser attaches the session cookie to any request to your domain, including
 * one triggered by a form on `evil.com`. So a state-changing request needs
 * proof that it came from your own page, not merely from a browser that happens
 * to hold the cookie.
 *
 * Double-submit: the CSRF token is set as a *readable* cookie, and the page's
 * JavaScript copies it into the `X-CSRF-Token` header. An attacker's page can
 * cause the cookie to be sent, but the same-origin policy prevents it from
 * *reading* the cookie, so it cannot produce the matching header.
 *
 * **Bearer-authenticated requests are exempt, and must be.** A bearer token is
 * not attached automatically by the browser, so there is no CSRF exposure to
 * begin with. Applying this check to the mobile app would break every mutation
 * it makes in exchange for no security benefit whatsoever.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Issued at login and rotated on refresh, alongside the session cookies. */
export async function issueCsrfToken(): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const store = await cookies();

  store.set(COOKIE_NAMES.csrf, token, {
    // Readable by JS on purpose — that is the whole mechanism. It carries no
    // authority by itself; possession of it proves same-origin script access.
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    maxAge: 24 * 60 * 60,
  });

  return token;
}

export async function clearCsrfToken(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAMES.csrf, "", { path: "/", maxAge: 0 });
}

/**
 * Enforces the double-submit check.
 *
 * Call only for cookie-authenticated mutations — `requireAuth` decides that and
 * invokes this for you.
 */
export async function assertCsrf(request: NextRequest): Promise<void> {
  if (SAFE_METHODS.has(request.method)) return;

  const header = request.headers.get("x-csrf-token");
  const cookie = (await cookies()).get(COOKIE_NAMES.csrf)?.value;

  if (!header || !cookie || !safeEqual(header, cookie)) {
    throw ApiError.forbidden(
      "CSRF validation failed. Refresh the page and try again.",
    );
  }
}
