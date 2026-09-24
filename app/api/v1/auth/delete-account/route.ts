import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as authService from "@/services/auth.service";
import { clearSessionCookies } from "@/lib/auth/cookies";
import { clearCsrfToken } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/session";

export const DELETE = route(async ({ request }) => {
  const principal = await requireAuth(request);

  const data = await authService.deleteAccount(principal.userId);

  await clearSessionCookies(principal.audience);
  await clearCsrfToken();

  return NextResponse.json(
    { success: true, status: 200, message: "Account deleted successfully", data },
    { status: 200 },
  );
});
