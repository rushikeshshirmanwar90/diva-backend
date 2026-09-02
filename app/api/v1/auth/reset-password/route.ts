import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { resetPasswordSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";

export const POST = route(async ({ request }) => {
  const input = await parseBody(request, resetPasswordSchema);
  const data = await authService.resetPassword(input);
  return NextResponse.json(
    { success: true, status: 200, message: "Password reset successfully", data },
    { status: 200 },
  );
});
