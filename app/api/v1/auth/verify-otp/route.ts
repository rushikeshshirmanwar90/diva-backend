import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { clientIp, userAgent } from "@/lib/http/request";
import { verifyOtpSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";
import { deliverSession } from "@/lib/auth/deliver-session";

export const POST = route(async ({ request }) => {
  const input = await parseBody(request, verifyOtpSchema);

  const result = await authService.verifyOtp(input, {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return deliverSession(request, result, "storefront", "Email verified successfully");
});
