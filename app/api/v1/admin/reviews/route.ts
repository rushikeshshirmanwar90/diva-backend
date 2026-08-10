import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/review.controller";

/** `GET /api/v1/admin/reviews` — the moderation queue. */
export const GET = route(({ request }) => controller.listForAdmin(request));
