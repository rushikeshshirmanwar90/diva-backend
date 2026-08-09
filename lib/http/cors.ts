import { env, isDevelopment } from "@/config/env";

/**
 * CORS for a credentialed, multi-origin API.
 *
 * The one rule that trips everyone: **`Access-Control-Allow-Origin: *` is
 * ignored by browsers when the request carries credentials.** Since the web
 * storefront authenticates with an httpOnly cookie, a wildcard here does not
 * "open things up" — it silently breaks every authenticated request with a CORS
 * error that reads as though the header were missing entirely.
 *
 * So: echo back the caller's exact origin, but only if it is on the allowlist.
 * `Vary: Origin` is mandatory alongside it, otherwise a CDN or the browser
 * cache can serve one origin's allow-header to a different origin.
 *
 * The mobile app sends `Authorization: Bearer` and usually no `Origin` header
 * at all; native clients are not subject to CORS, so a missing origin is fine
 * and simply gets no CORS headers back.
 */

const ALLOWED = new Set(env.CORS_ALLOWED_ORIGINS);

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED.has(origin)) return true;

  // Expo Go and React Native dev tooling pick a random localhost port on each
  // start, which is impossible to pin in an allowlist. Development only.
  if (isDevelopment && /^http:\/\/localhost:\d+$/.test(origin)) return true;

  return false;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };

  if (!isOriginAllowed(origin) || !origin) return headers;

  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Credentials"] = "true";
  headers["Access-Control-Expose-Headers"] = "X-Request-Id, X-RateLimit-Remaining";

  return headers;
}

export function preflightHeaders(origin: string | null): Record<string, string> {
  return {
    ...corsHeaders(origin),
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-CSRF-Token, X-Guest-Token, X-Request-Id",
    // Cache the preflight for a day so the browser stops re-asking before every
    // mutation. Lower this while actively changing the header set.
    "Access-Control-Max-Age": "86400",
  };
}
