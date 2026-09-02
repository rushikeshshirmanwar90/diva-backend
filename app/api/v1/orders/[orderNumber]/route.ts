import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { orderNumberParam } from "@/validators/checkout";
import * as orderService from "@/services/order.service";
import { requireAuth } from "@/lib/auth/session";

/** Scoped to the caller: another customer's order number returns 404, not 403. */
export const GET = route<{ orderNumber: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { orderNumber } = parseParams(params, orderNumberParam);
  const data = await orderService.getOrderForUser(orderNumber, principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Order fetched successfully", data },
    { status: 200 },
  );
});
