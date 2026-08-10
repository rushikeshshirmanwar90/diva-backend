import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/review.controller";

/** `POST /api/v1/admin/reviews/:id/reply` — the seller's reply. */
export const POST = route<{ id: string }>(({ request, params }) =>
  controller.replyToReview(request, params),
);
