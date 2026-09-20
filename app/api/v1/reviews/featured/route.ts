import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as reviewService from "@/services/review.service";

/**
 * `GET /api/v1/reviews/featured` — the homepage's "What customers actually
 * say" section. Public; only approved reviews staff have picked are returned.
 */
export const GET = route(async () => {
  const data = await reviewService.listFeatured();
  return NextResponse.json(
    { success: true, status: 200, message: "Featured reviews fetched successfully", data },
    { status: 200 },
  );
});
