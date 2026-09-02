import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as shippingService from "@/services/shipping.service";

/**
 * Shiprocket tracking callback.
 *
 * Authenticated by the `x-api-key` shared secret set on Shiprocket's webhook
 * screen, matched against `SHIPROCKET_WEBHOOK_TOKEN`. Register the URL as:
 *
 *     https://<APP_URL>/api/v1/shipping/webhook
 */
export const POST = route(async ({ request }) => {
  // Tolerant of a malformed body: an empty object flows through to the service,
  // which answers "no AWB in payload" with a 200 rather than making Shiprocket
  // retry a message that will never parse.
  const body = await request
    .json()
    .catch(() => ({}))
    .then((value) => value as Parameters<typeof shippingService.handleTrackingWebhook>[0]["body"]);

  const data = await shippingService.handleTrackingWebhook({
    apiKeyHeader: request.headers.get("x-api-key"),
    body,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Webhook processed successfully", data },
    { status: 200 },
  );
});
