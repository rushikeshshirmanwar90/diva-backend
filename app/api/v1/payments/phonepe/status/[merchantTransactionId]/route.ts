import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * Live status for one payment attempt, read from PhonePe.
 *
 * The return page polls this while a payment settles. It queries the gateway
 * rather than the database because the customer is usually back before the
 * webhook has landed.
 */
export const GET = route<{ merchantTransactionId: string }>(({ request, params }) =>
  controller.paymentStatus(request, params),
);
