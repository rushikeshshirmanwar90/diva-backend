import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * Files the Shiprocket consignment by hand.
 *
 * Normally this happens automatically when payment settles. This endpoint is
 * for when that failed — Shiprocket down, pickup location misconfigured — and
 * the order is sitting in the CONFIRMED queue. Safe to call twice; an existing
 * shipment is returned rather than duplicated.
 */
export const POST = route<{ orderNumber: string }>(({ request, params }) =>
  controller.createShipment(request, params),
);
