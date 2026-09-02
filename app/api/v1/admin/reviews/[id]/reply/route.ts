import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { replyToReviewSchema } from "@/validators/review";
import * as reviewService from "@/services/review.service";
import { requireStaff } from "@/lib/auth/session";

/** The seller's reply. */
export const POST = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "review:moderate");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, replyToReviewSchema);
  const data = await reviewService.replyToReview(id, input.body, principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Reply posted successfully", data },
    { status: 200 },
  );
});
