import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { paginationMeta } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validate";
import { requireStaff } from "@/lib/auth/session";
import { listOrdersAdminSchema } from "@/validators/checkout";
import * as orderService from "@/services/order.service";

/** Every order, newest first, filterable by status and searchable by order number or email prefix. */
export const GET = route(async ({ request }) => {
  await requireStaff(request, "order:read");
  const query = parseQuery(request, listOrdersAdminSchema);

  const result = await orderService.listOrdersForStaff(query);

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
