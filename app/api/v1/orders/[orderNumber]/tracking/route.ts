import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { orderNumberParam } from "@/validators/checkout";
import * as shippingService from "@/services/shipping.service";
import { requireAuth } from "@/lib/auth/session";

/**
 * Courier tracking for one order.
 *
 * Served from our own `Shipment.trackingEvents`, not by proxying Shiprocket per
 * request — the webhook keeps that array current, and a customer refreshing the
 * page should not spend courier API quota.
 */
export const GET = route<{ orderNumber: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { orderNumber } = parseParams(params, orderNumberParam);
  const data = await shippingService.getTracking(orderNumber, principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Tracking fetched successfully", data },
    { status: 200 },
  );
});
