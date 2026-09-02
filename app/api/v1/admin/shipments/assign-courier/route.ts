import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { assignCourierSchema } from "@/validators/checkout";
import * as orderService from "@/services/order.service";
import * as shippingService from "@/services/shipping.service";
import { requireStaff } from "@/lib/auth/session";

/**
 * Assigns a courier, obtains the AWB and books the pickup.
 *
 * Separate from filing the consignment because this is the step that most often
 * needs a person: couriers refuse routes, and retrying must not re-file the
 * shipment.
 */
export const POST = route(async ({ request }) => {
  await requireStaff(request, "shipment:write");
  const input = await parseBody(request, assignCourierSchema);

  const order = await orderService.getOrderByNumberForStaff(input.orderNumber);
  const data = await shippingService.assignCourier(String(order._id), input.courierId);

  return NextResponse.json(
    { success: true, status: 200, message: "Courier assigned successfully", data },
    { status: 200 },
  );
});
