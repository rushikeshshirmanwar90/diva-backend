import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/review.controller";

/** `PATCH /api/v1/admin/reviews/:id` — approve or reject. */
export const PATCH = route<{ id: string }>(({ request, params }) =>
  controller.moderateReview(request, params),
);
