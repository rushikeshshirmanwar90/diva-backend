import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { paginationMeta } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validate";
import { listMyReviewsSchema } from "@/validators/review";
import * as reviewService from "@/services/review.service";
import { requireAuth } from "@/lib/auth/session";

/** A signed-in customer's own reviews, any status. */
export const GET = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const query = parseQuery(request, listMyReviewsSchema);

  const result = await reviewService.listForUser(principal.userId, query);

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Your reviews fetched successfully",
      data: result.items,
      meta: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
    },
    { status: 200 },
  );
});
