import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/** The customer's own order history. */
export const GET = route(({ request }) => controller.listOrders(request));

/**
 * `POST /api/v1/orders`
 *
 * Creates a PENDING order and holds stock for it. Payment is a separate call —
 * see `/payments/phonepe/initiate` — so a customer who abandons the gateway
 * leaves a resumable order rather than nothing.
 */
export const POST = route(({ request }) => controller.createOrder(request));
