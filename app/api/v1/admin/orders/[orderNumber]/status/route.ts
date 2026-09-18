import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { requireStaff } from "@/lib/auth/session";
import { orderNumberParam, setOrderStatusSchema } from "@/validators/checkout";
import * as orderService from "@/services/order.service";

/**
 * Moves an order along the courier leg by hand — shipped, out for delivery,
 * delivered, and the two return steps. See `MANUAL_ORDER_STATUSES` for why
 * only those.
 */
export const POST = route<{ orderNumber: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "order:write");
  const { orderNumber } = parseParams(params, orderNumberParam);
  const input = await parseBody(request, setOrderStatusSchema);

  const data = await orderService.setOrderStatusByStaff(orderNumber, input, principal.userId);

  return NextResponse.json(
    { success: true, status: 200, message: "Order status updated", data },
    { status: 200 },
  );
});
