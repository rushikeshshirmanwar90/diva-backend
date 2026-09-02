import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { orderNumberParam } from "@/validators/checkout";
import * as orderService from "@/services/order.service";
import * as shippingService from "@/services/shipping.service";
import { requireStaff } from "@/lib/auth/session";

/**
 * Files the Shiprocket consignment by hand.
 *
 * Normally this happens automatically when payment settles. This endpoint is
 * for when that failed — Shiprocket down, pickup location misconfigured — and
 * the order is sitting in the CONFIRMED queue. Safe to call twice; an existing
 * shipment is returned rather than duplicated.
 */
export const POST = route<{ orderNumber: string }>(async ({ request, params }) => {
  await requireStaff(request, "shipment:write");
  const { orderNumber } = parseParams(params, orderNumberParam);

  const order = await orderService.getOrderByNumberForStaff(orderNumber);
  const data = await shippingService.createShipmentForOrder(String(order._id));

  return NextResponse.json(
    { success: true, status: 201, message: "Shipment created successfully", data },
    { status: 201 },
  );
});
