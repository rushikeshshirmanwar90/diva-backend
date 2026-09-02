import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { moderateReviewSchema } from "@/validators/review";
import * as reviewService from "@/services/review.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

/** Approve or reject. */
export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "review:moderate");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, moderateReviewSchema);

  const review = await reviewService.moderateReview(id, input, principal.userId);

  // Always audited: publishing or suppressing a customer's words is a decision
  // someone must be able to answer for later.
  audit.record(audit.auditContext(request, principal), {
    action: `review.${input.status.toLowerCase()}`,
    entityType: "Review",
    entityId: id,
    after: { status: input.status, rejectionReason: input.rejectionReason },
  });

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: input.status === "APPROVED" ? "Review approved successfully" : "Review rejected successfully",
      data: review,
    },
    { status: 200 },
  );
});
