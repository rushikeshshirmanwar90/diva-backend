import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/notification.controller";

export const GET = route(({ request }) => controller.list(request));
