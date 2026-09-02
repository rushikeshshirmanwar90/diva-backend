import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as authService from "@/services/auth.service";
import { readRefreshCookie, clearSessionCookies } from "@/lib/auth/cookies";
import { clearCsrfToken } from "@/lib/auth/csrf";

export const POST = route(async ({ request }) => {
  const audience =
    request.nextUrl.searchParams.get("audience") === "admin" ? "admin" : "storefront";

  const token = request.headers.get("x-refresh-token") ?? (await readRefreshCookie(audience));

  await authService.logout(token ?? undefined);

  // Cookies are cleared unconditionally. If the token was already invalid the
  // browser should still stop sending it.
  await clearSessionCookies(audience);
  await clearCsrfToken();

  return NextResponse.json(
    { success: true, status: 200, message: "Logged out successfully", data: { loggedOut: true } },
    { status: 200 },
  );
});
