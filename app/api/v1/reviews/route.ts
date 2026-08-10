import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/review.controller";

/** `POST /api/v1/reviews` — a signed-in customer reviews a product. */
export const POST = route(({ request }) => controller.submitReview(request));
