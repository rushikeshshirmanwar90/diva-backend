import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { paginationMeta } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validate";
import { listCustomersSchema } from "@/validators/admin";
import * as customerService from "@/services/customer.service";
import { requireStaff } from "@/lib/auth/session";

export const GET = route(async ({ request }) => {
  await requireStaff(request, "customer:read");

  const query = parseQuery(request, listCustomersSchema);
  const result = await customerService.listCustomers(query);

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Customers fetched successfully",
      data: result.items,
      meta: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    },
    { status: 200 },
  );
});
