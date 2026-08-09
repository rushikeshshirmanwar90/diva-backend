import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/auth.controller";

export const POST = route(({ request }) => controller.login(request));
