import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as paymentService from "@/services/payment.service";

/**
 * PhonePe's server-to-server callback. **Unauthenticated by our own scheme.**
 *
 * It authenticates with PhonePe's: a `SHA256(username:password)` value in the
 * `Authorization` header, checked in `lib/payments/phonepe.ts`. Do not add
 * `requireAuth` here — PhonePe holds no session — and do not add CSRF, which
 * would reject every delivery.
 *
 * Configure the URL on the PhonePe dashboard as:
 *
 *     https://<APP_URL>/api/v1/payments/phonepe/webhook
 *
 * It must be publicly reachable. For local testing, tunnel it (`ngrok http
 * 4000`) rather than pointing it at localhost.
 */
export const POST = route(async ({ request }) => {
  // A signature is computed over bytes; re-serialising parsed JSON changes key
  // order and whitespace and invalidates it — so the raw body is read, not
  // parsed here.
  const rawBody = await request.text();

  const data = await paymentService.handleWebhook({
    authorizationHeader: request.headers.get("authorization"),
    rawBody,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Webhook processed successfully", data },
    { status: 200 },
  );
});
