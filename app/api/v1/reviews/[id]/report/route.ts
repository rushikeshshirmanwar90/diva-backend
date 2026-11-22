import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { reportReviewSchema } from "@/validators/review";
import * as reviewService from "@/services/review.service";
import { requireAuth } from "@/lib/auth/session";

/** A signed-in customer reports a review for staff to look at. One per account. */
export const POST = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, reportReviewSchema);
  const data = await reviewService.reportReview(id, principal.userId, input);
  return NextResponse.json(
    { success: true, status: 200, message: "Thanks, we'll look at this review", data },
    { status: 200 },
  );
});
