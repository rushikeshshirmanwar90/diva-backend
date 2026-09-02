import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import * as reviewService from "@/services/review.service";
import { requireAuth } from "@/lib/auth/session";

/** A customer withdraws their own review. */
export const DELETE = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);
  const data = await reviewService.deleteReview(id, principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Review deleted successfully", data },
    { status: 200 },
  );
});
