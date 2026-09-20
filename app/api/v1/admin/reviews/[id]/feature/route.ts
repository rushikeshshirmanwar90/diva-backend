import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { featureReviewSchema } from "@/validators/review";
import * as reviewService from "@/services/review.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

/** Show a review on the homepage, or take it off. */
export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "review:moderate");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, featureReviewSchema);

  const review = await reviewService.setFeatured(id, input.isFeatured);

  audit.record(audit.auditContext(request, principal), {
    action: input.isFeatured ? "review.feature" : "review.unfeature",
    entityType: "Review",
    entityId: id,
    after: { isFeatured: input.isFeatured },
  });

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: input.isFeatured ? "Review added to the homepage" : "Review removed from the homepage",
      data: review,
    },
    { status: 200 },
  );
});
