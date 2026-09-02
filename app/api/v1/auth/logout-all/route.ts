import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as authService from "@/services/auth.service";
import { clearSessionCookies } from "@/lib/auth/cookies";
import { clearCsrfToken } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";

export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);

  await authService.logoutEverywhere(principal.userId);
  await clearSessionCookies(principal.audience);
  await clearCsrfToken();

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Logged out of all sessions successfully",
      data: { loggedOut: true },
    },
    { status: 200 },
  );
});
