import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * Customer cancellation. Allowed up to dispatch; after that it is a return.
 *
 * Releases the stock hold but does **not** refund — money is returned through
 * `/admin/payments/refund`, so a failing gateway call cannot leave an order
 * that is neither cancelled nor refunded.
 */
export const POST = route<{ orderNumber: string }>(({ request, params }) =>
  controller.cancelOrder(request, params),
);
