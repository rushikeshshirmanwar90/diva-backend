import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import * as reviewService from "@/services/review.service";
import { requireAuth } from "@/lib/auth/session";

/** Hides every review by this review's author from the signed-in customer. */
export const POST = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);
  const data = await reviewService.blockReviewAuthor(id, principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "You won't see reviews from this customer", data },
    { status: 200 },
  );
});
