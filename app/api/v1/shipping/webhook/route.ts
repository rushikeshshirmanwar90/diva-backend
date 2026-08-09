import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * Shiprocket tracking callback.
 *
 * Authenticated by the `x-api-key` shared secret set on Shiprocket's webhook
 * screen, matched against `SHIPROCKET_WEBHOOK_TOKEN`. Register the URL as:
 *
 *     https://<APP_URL>/api/v1/shipping/webhook
 */
export const POST = route(({ request }) => controller.shiprocketWebhook(request));
