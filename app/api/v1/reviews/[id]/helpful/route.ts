import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/review.controller";

/** `POST /api/v1/reviews/:id/helpful` — one vote per account. */
export const POST = route<{ id: string }>(({ request, params }) =>
  controller.markHelpful(request, params),
);
