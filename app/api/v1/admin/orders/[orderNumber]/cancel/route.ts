import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { orderNumberParam, cancelOrderSchema } from "@/validators/checkout";
import * as orderService from "@/services/order.service";
import { requireStaff } from "@/lib/auth/session";

/**
 * Staff cancellation, including a consignment already filed with Shiprocket.
 *
 * Reaches further than the customer-facing cancel: the order machine still
 * permits CANCELLED through SHIPMENT_CREATED, so an operator can call this up
 * to the point a courier actually picks the parcel up. Past that, cancel the
 * AWB from the Shiprocket dashboard directly and handle it here as a return.
 */
export const POST = route<{ orderNumber: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "shipment:write");
  const { orderNumber } = parseParams(params, orderNumberParam);
  const { reason } = await parseBody(request, cancelOrderSchema);
  const data = await orderService.cancelOrderByStaff(orderNumber, principal.userId, reason);
  return NextResponse.json(
    { success: true, status: 200, message: "Order cancelled successfully", data },
    { status: 200 },
  );
});
