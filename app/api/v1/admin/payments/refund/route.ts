import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * Full or partial refund. Requires `payment:refund`, which only `finance`,
 * `admin` and `superadmin` hold.
 *
 * There is deliberately no customer-facing equivalent.
 */
export const POST = route(({ request }) => controller.refund(request));
