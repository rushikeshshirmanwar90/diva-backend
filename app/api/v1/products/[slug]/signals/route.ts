import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { ApiError } from "@/lib/api/errors";
import { slugParam } from "@/validators/common";
import * as recommendationService from "@/services/recommendation.service";

/**
 * `GET /api/v1/products/:slug/signals`
 *
 * Co-purchase and co-view counts feeding the storefront's "You may also like"
 * rail. Public: it exposes nothing about any individual, only which products
 * tend to go together.
 */
export const GET = route<{ slug: string }>(async ({ params }) => {
  const { slug } = parseParams(params, slugParam);

  const data = await recommendationService.getProductSignals(slug);
  if (!data) throw ApiError.notFound("We could not find that product.");

  return NextResponse.json(
    { success: true, status: 200, message: "Product signals fetched successfully", data },
    { status: 200 },
  );
});
