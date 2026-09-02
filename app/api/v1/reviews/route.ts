import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { createReviewSchema } from "@/validators/review";
import * as reviewService from "@/services/review.service";
import { requireAuth } from "@/lib/auth/session";

/** `POST /api/v1/reviews` — a signed-in customer reviews a product. */
export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const input = await parseBody(request, createReviewSchema);
  const data = await reviewService.submitReview(input, principal.userId);

  return NextResponse.json(
    { success: true, status: 201, message: "Review submitted successfully", data },
    { status: 201 },
  );
});
