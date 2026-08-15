import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/notification.controller";

export const POST = route(({ request }) => controller.markAllRead(request));
