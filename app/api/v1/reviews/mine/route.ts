import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/review.controller";

export const GET = route(({ request }) => controller.listMine(request));
