import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/review.controller";

/** `GET /api/v1/products/:slug/reviews` — approved reviews, public. */
export const GET = route<{ slug: string }>(({ request, params }) =>
  controller.listForProduct(request, params),
);
