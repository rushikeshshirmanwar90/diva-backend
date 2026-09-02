import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { clientIp, userAgent } from "@/lib/http/request";
import { loginSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";
import { deliverSession } from "@/lib/auth/deliver-session";
import { ApiError } from "@/lib/api/errors";
import { env } from "@/config/env";

/**
 * Resolves which account a login attempt is for.
 *
 * The admin console submits a password with no email, so the address is filled
 * in here — server-side, deliberately, so it never ships to the browser. Every
 * check downstream is untouched: the password is still verified against that
 * user's hash, and the per-account rate limit still has a real identifier to
 * count against.
 */
function resolveLoginEmail(input: { email?: string; audience: "storefront" | "admin" }): string {
  if (input.email) return input.email;

  const configured = env.ADMIN_LOGIN_EMAIL ?? env.SEED_ADMIN_EMAIL;

  if (!configured) {
    // A 500, not a 401: nothing the person at the keyboard typed is wrong. The
    // deployment is missing a variable, and saying so beats "incorrect password"
    // on a password that is perfectly correct.
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "No admin account is configured. Set ADMIN_LOGIN_EMAIL.",
    );
  }

  return configured.toLowerCase().trim();
}

export const POST = route(async ({ request }) => {
  const input = await parseBody(request, loginSchema);
  const email = resolveLoginEmail(input);

  const result = await authService.login(
    { ...input, email },
    { ip: clientIp(request), userAgent: userAgent(request) },
  );

  return deliverSession(request, result, input.audience, "Login successful");
});
