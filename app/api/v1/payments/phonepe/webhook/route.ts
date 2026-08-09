import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

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
export const POST = route(({ request }) => controller.phonePeWebhook(request));
