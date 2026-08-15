import type { NextRequest } from "next/server";
import { ok, created } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { clientIp, userAgent } from "@/lib/http/request";
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshSchema,
  updateProfileSchema,
  googleLoginSchema,
} from "@/validators/auth";
import * as authService from "@/services/auth.service";
import { setSessionCookies, clearSessionCookies, readRefreshCookie } from "@/lib/auth/cookies";
import { issueCsrfToken, clearCsrfToken } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/errors";
import { env } from "@/config/env";

/**
 * HTTP shaping for auth.
 *
 * The controller's whole job is deciding **how tokens are delivered**, which
 * differs per client and is the one place that difference is allowed to exist:
 *
 *  - `audience: "storefront" | "admin"` → httpOnly cookies, and the tokens are
 *    *not* echoed in the body. Putting them in the JSON as well would hand any
 *    XSS on the page the very credential the httpOnly flag exists to protect.
 *
 *  - Everything else (the mobile app) → tokens in the response body, for
 *    `expo-secure-store`. No cookie is set, since there is no cookie jar.
 *
 * The mode is chosen by the client sending `X-Client: mobile`, defaulting to
 * cookies — the safer default for anything running in a browser.
 */

function isMobileClient(request: NextRequest): boolean {
  return request.headers.get("x-client")?.toLowerCase() === "mobile";
}

async function deliverSession(
  request: NextRequest,
  result: authService.AuthResult,
  audience: "storefront" | "admin",
) {
  if (isMobileClient(request)) {
    return ok({
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: 900,
    });
  }

  await setSessionCookies(audience, result.tokens);
  const csrfToken = await issueCsrfToken();

  // The CSRF token is returned so the client can put it in a header without
  // parsing cookies. It is not a credential — see lib/auth/csrf.ts.
  return ok({ user: result.user, csrfToken });
}

export async function register(request: NextRequest) {
  const input = await parseBody(request, registerSchema);

  const result = await authService.register(input, {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return created(result);
}

export async function verifyOtp(request: NextRequest) {
  const input = await parseBody(request, verifyOtpSchema);

  const result = await authService.verifyOtp(input, {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return deliverSession(request, result, "storefront");
}

export async function resendOtp(request: NextRequest) {
  const input = await parseBody(request, resendOtpSchema);

  return ok(
    await authService.resendOtp(input.email, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    }),
  );
}

/**
 * Resolves which account a login attempt is for.
 *
 * The admin console submits a password with no email, so the address is filled
 * in here — server-side, deliberately, so it never ships to the browser. Every
 * check downstream is untouched: the password is still verified against that
 * user's hash, and the per-account rate limit still has a real identifier to
 * count against.
 */
function resolveLoginEmail(input: { email?: string; audience: "storefront" | "admin" }): string {
  if (input.email) return input.email;

  const configured = env.ADMIN_LOGIN_EMAIL ?? env.SEED_ADMIN_EMAIL;

  if (!configured) {
    // A 500, not a 401: nothing the person at the keyboard typed is wrong. The
    // deployment is missing a variable, and saying so beats "incorrect password"
    // on a password that is perfectly correct.
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "No admin account is configured. Set ADMIN_LOGIN_EMAIL.",
    );
  }

  return configured.toLowerCase().trim();
}

export async function login(request: NextRequest) {
  const input = await parseBody(request, loginSchema);
  const email = resolveLoginEmail(input);

  const result = await authService.login(
    { ...input, email },
    {
      ip: clientIp(request),
      userAgent: userAgent(request),
    },
  );

  return deliverSession(request, result, input.audience);
}

export async function googleLogin(request: NextRequest) {
  const input = await parseBody(request, googleLoginSchema);

  const result = await authService.loginWithGoogle(input, {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return deliverSession(request, result, input.audience);
}

export async function refresh(request: NextRequest) {
  const input = await parseBody(request, refreshSchema).catch(() => ({
    refreshToken: undefined,
    audience: "storefront" as const,
  }));

  // Body first (mobile), then cookie (browsers, which cannot read it in JS).
  const token = input.refreshToken ?? (await readRefreshCookie(input.audience));

  if (!token) {
    throw ApiError.unauthenticated("No refresh token supplied.");
  }

  const result = await authService.refresh(token, {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return deliverSession(request, result, input.audience);
}

export async function logout(request: NextRequest) {
  const audience =
    request.nextUrl.searchParams.get("audience") === "admin" ? "admin" : "storefront";

  const token =
    request.headers.get("x-refresh-token") ?? (await readRefreshCookie(audience));

  await authService.logout(token ?? undefined);

  // Cookies are cleared unconditionally. If the token was already invalid the
  // browser should still stop sending it.
  await clearSessionCookies(audience);
  await clearCsrfToken();

  return ok({ loggedOut: true });
}

export async function logoutEverywhere(request: NextRequest) {
  const principal = await requireAuth(request);

  await authService.logoutEverywhere(principal.userId);
  await clearSessionCookies(principal.audience);
  await clearCsrfToken();

  return ok({ loggedOut: true });
}

export async function forgotPassword(request: NextRequest) {
  const input = await parseBody(request, forgotPasswordSchema);

  return ok(
    await authService.forgotPassword(input.email, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    }),
  );
}

export async function resetPassword(request: NextRequest) {
  const input = await parseBody(request, resetPasswordSchema);
  return ok(await authService.resetPassword(input));
}

export async function changePassword(request: NextRequest) {
  const principal = await requireAuth(request);
  const input = await parseBody(request, changePasswordSchema);

  const result = await authService.changePassword(principal.userId, input);

  // The password change revoked every session, including this one.
  await clearSessionCookies(principal.audience);

  return ok(result);
}

export async function getMe(request: NextRequest) {
  const principal = await requireAuth(request);
  return ok(await authService.getProfile(principal.userId));
}

export async function updateMe(request: NextRequest) {
  const principal = await requireAuth(request);
  const input = await parseBody(request, updateProfileSchema);

  return ok(await authService.updateProfile(principal.userId, input));
}
