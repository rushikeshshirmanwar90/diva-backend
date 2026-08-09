import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/** Scoped to the caller: another customer's order number returns 404, not 403. */
export const GET = route<{ orderNumber: string }>(({ request, params }) =>
  controller.getOrder(request, params),
);
