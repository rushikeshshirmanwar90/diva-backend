import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * `POST /api/v1/payments/phonepe/initiate`
 *
 * Returns `{ redirectUrl }` — send the browser there. The amount comes from the
 * stored order, never from the request, so there is nothing here for a client
 * to tamper with.
 */
export const POST = route(({ request }) => controller.initiatePayment(request));
