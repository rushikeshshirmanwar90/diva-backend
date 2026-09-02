import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { clientIp, userAgent } from "@/lib/http/request";
import { googleLoginSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";
import { deliverSession } from "@/lib/auth/deliver-session";

export const POST = route(async ({ request }) => {
  const input = await parseBody(request, googleLoginSchema);

  const result = await authService.loginWithGoogle(input, {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return deliverSession(request, result, input.audience, "Login successful");
});
