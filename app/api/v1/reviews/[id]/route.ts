import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/review.controller";

export const DELETE = route<{ id: string }>(({ request, params }) =>
  controller.deleteReview(request, params),
);
