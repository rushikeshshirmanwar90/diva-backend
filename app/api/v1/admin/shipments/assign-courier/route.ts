import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * Assigns a courier, obtains the AWB and books the pickup.
 *
 * Separate from filing the consignment because this is the step that most often
 * needs a person: couriers refuse routes, and retrying must not re-file the
 * shipment.
 */
export const POST = route(({ request }) => controller.assignCourier(request));
