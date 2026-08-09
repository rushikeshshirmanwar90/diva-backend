import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * Courier tracking for one order.
 *
 * Served from our own `Shipment.trackingEvents`, not by proxying Shiprocket per
 * request — the webhook keeps that array current, and a customer refreshing the
 * page should not spend courier API quota.
 */
export const GET = route<{ orderNumber: string }>(({ request, params }) =>
  controller.tracking(request, params),
);
