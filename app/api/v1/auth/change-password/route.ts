import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { changePasswordSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";
import { clearSessionCookies } from "@/lib/auth/cookies";
import { requireAuth } from "@/lib/auth/session";

export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const input = await parseBody(request, changePasswordSchema);

  const data = await authService.changePassword(principal.userId, input);

  // The password change revoked every session, including this one.
  await clearSessionCookies(principal.audience);

  return NextResponse.json(
    { success: true, status: 200, message: "Password changed successfully", data },
    { status: 200 },
  );
});
