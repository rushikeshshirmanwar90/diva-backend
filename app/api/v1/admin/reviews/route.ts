import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { paginationMeta } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validate";
import { listReviewsForAdminSchema } from "@/validators/review";
import * as reviewService from "@/services/review.service";
import { requireStaff } from "@/lib/auth/session";

/** The moderation queue, the only view that sees PENDING. */
export const GET = route(async ({ request }) => {
  await requireStaff(request, "review:moderate");
  const query = parseQuery(request, listReviewsForAdminSchema);

  const result = await reviewService.listForAdmin(query);

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Reviews fetched successfully",
      data: result.items,
      meta: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    },
    { status: 200 },
  );
});
