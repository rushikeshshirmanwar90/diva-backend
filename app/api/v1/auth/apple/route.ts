import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { clientIp, userAgent } from "@/lib/http/request";
import { appleLoginSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";
import { deliverSession } from "@/lib/auth/deliver-session";

/**
 * Sign in with Apple.
 *
 * The app sends the `identityToken` (a JWT) that Apple hands to `signInAsync`.
 * We verify its signature against Apple's published EC keys, check `iss` and
 * `aud`, then create or reuse the account exactly as the Google flow does.
 *
 * Required by App Store guideline 4.8: any app offering third-party login must
 * also offer Sign in with Apple.
 */
export const POST = route(async ({ request }) => {
  const input = await parseBody(request, appleLoginSchema);

  const result = await authService.loginWithApple(input, {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return deliverSession(request, result, input.audience, "Login successful");
});
