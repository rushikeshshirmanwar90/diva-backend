import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import * as reviewService from "@/services/review.service";
import { requireAuth } from "@/lib/auth/session";

/** One vote per account. */
export const POST = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);
  const data = await reviewService.markHelpful(id, principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Review marked as helpful", data },
    { status: 200 },
  );
});
