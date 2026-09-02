import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { orderNumberParam, cancelOrderSchema } from "@/validators/checkout";
import * as orderService from "@/services/order.service";
import { requireAuth } from "@/lib/auth/session";

/**
 * Customer cancellation. Allowed up to dispatch; after that it is a return.
 *
 * Releases the stock hold but does **not** refund — money is returned through
 * `/admin/payments/refund`, so a failing gateway call cannot leave an order
 * that is neither cancelled nor refunded.
 */
export const POST = route<{ orderNumber: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { orderNumber } = parseParams(params, orderNumberParam);
  const { reason } = await parseBody(request, cancelOrderSchema);
  const data = await orderService.cancelOrder(orderNumber, principal.userId, reason);
  return NextResponse.json(
    { success: true, status: 200, message: "Order cancelled successfully", data },
    { status: 200 },
  );
});
