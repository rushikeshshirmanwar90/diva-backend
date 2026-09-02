import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { paginationMeta } from "@/lib/api/pagination";
import { parseBody, parseQuery } from "@/lib/api/validate";
import { requireAuth } from "@/lib/auth/session";
import { createOrderSchema, listOrdersSchema } from "@/validators/checkout";
import * as orderService from "@/services/order.service";

/** The customer's own order history. */
export const GET = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const query = parseQuery(request, listOrdersSchema);

  const result = await orderService.listOrdersForUser(principal.userId, query);

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Orders fetched successfully",
      data: result.items,
      meta: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    },
    { status: 200 },
  );
});

/**
 * `POST /api/v1/orders`
 *
 * Creates a PENDING order and holds stock for it. Payment is a separate call —
 * see `/payments/phonepe/initiate` — so a customer who abandons the gateway
 * leaves a resumable order rather than nothing.
 */
export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const input = await parseBody(request, createOrderSchema);

  const order = await orderService.createOrder(input, {
    userId: principal.userId,
    email: principal.email,
  });

  return NextResponse.json(
    { success: true, status: 201, message: "Order created successfully", data: order },
    { status: 201 },
  );
});
