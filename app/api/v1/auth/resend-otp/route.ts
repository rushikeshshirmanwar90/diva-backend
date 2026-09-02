import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { resendOtpSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";

export const POST = route(async ({ request }) => {
  const input = await parseBody(request, resendOtpSchema);
  const data = await authService.resendOtp(input.email);
  return NextResponse.json(
    { success: true, status: 200, message: "Verification code sent successfully", data },
    { status: 200 },
  );
});
