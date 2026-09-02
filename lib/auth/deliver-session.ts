import { NextResponse, type NextRequest } from "next/server";
import type { AuthResult } from "@/services/auth.service";
import { setSessionCookies } from "@/lib/auth/cookies";
import { issueCsrfToken } from "@/lib/auth/csrf";

/**
 * Decides **how tokens are delivered**, which differs per client and is the
 * one place that difference is allowed to exist:
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

export async function deliverSession(
  request: NextRequest,
  result: AuthResult,
  audience: "storefront" | "admin",
  message: string,
): Promise<NextResponse> {
  if (isMobileClient(request)) {
    return NextResponse.json(
      {
        success: true,
        status: 200,
        message,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: 900,
        },
      },
      { status: 200 },
    );
  }

  await setSessionCookies(audience, result.tokens);
  const csrfToken = await issueCsrfToken();

  // The CSRF token is returned so the client can put it in a header without
  // parsing cookies. It is not a credential — see lib/auth/csrf.ts.
  return NextResponse.json(
    { success: true, status: 200, message, data: { user: result.user, csrfToken } },
    { status: 200 },
  );
}
