import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * Staff cancellation, including a consignment already filed with Shiprocket.
 *
 * Reaches further than the customer-facing cancel: the order machine still
 * permits CANCELLED through SHIPMENT_CREATED, so an operator can call this up
 * to the point a courier actually picks the parcel up. Past that, cancel the
 * AWB from the Shiprocket dashboard directly and handle it here as a return.
 */
export const POST = route<{ orderNumber: string }>(({ request, params }) =>
  controller.cancelOrderByStaff(request, params),
);
