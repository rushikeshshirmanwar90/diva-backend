import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { requireStaff } from "@/lib/auth/session";
import { orderNumberParam } from "@/validators/checkout";
import * as orderService from "@/services/order.service";

/** One order with its payment, shipment and the manual status moves allowed from here. */
export const GET = route<{ orderNumber: string }>(async ({ request, params }) => {
  await requireStaff(request, "order:read");
  const { orderNumber } = parseParams(params, orderNumberParam);

  const data = await orderService.getOrderDetailForStaff(orderNumber);

  return NextResponse.json(
    { success: true, status: 200, message: "Order fetched successfully", data },
    { status: 200 },
  );
});
