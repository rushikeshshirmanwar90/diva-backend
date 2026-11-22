import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { paginationMeta } from "@/lib/api/pagination";
import { parseQuery, parseParams } from "@/lib/api/validate";
import { slugParam } from "@/validators/common";
import { listReviewsSchema } from "@/validators/review";
import * as reviewService from "@/services/review.service";
import { getPrincipal } from "@/lib/auth/session";

/**
 * Public, approved reviews only. Auth is optional: a signed-in customer's
 * blocked authors and reported reviews are filtered out.
 */
export const GET = route<{ slug: string }>(async ({ request, params }) => {
  const { slug } = parseParams(params, slugParam);
  const query = parseQuery(request, listReviewsSchema);

  const viewer = await getPrincipal(request);

  const result = await reviewService.listForProduct(slug, query, viewer?.userId);

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Reviews fetched successfully",
      data: result.items,
      meta: {
        ...paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
        // The product-wide average travels with the page so a client rendering
        // the summary block does not need a second request for two numbers.
        summary: result.summary,
      },
    },
    { status: 200 },
  );
});
