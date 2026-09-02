import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { clientIp, userAgent } from "@/lib/http/request";
import { refreshSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";
import { readRefreshCookie } from "@/lib/auth/cookies";
import { deliverSession } from "@/lib/auth/deliver-session";
import { ApiError } from "@/lib/api/errors";

export const POST = route(async ({ request }) => {
  const input = await parseBody(request, refreshSchema).catch(() => ({
    refreshToken: undefined,
    audience: "storefront" as const,
  }));

  // Body first (mobile), then cookie (browsers, which cannot read it in JS).
  const token = input.refreshToken ?? (await readRefreshCookie(input.audience));

  if (!token) {
    throw ApiError.unauthenticated("No refresh token supplied.");
  }

  const result = await authService.refresh(token, {
    ip: clientIp(request),
    userAgent: userAgent(request),
  });

  return deliverSession(request, result, input.audience, "Session refreshed successfully");
});
