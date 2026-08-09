import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/auth.controller";

export const GET = route(({ request }) => controller.getMe(request));
export const PATCH = route(({ request }) => controller.updateMe(request));
