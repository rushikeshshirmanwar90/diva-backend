import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/notification.controller";

export const POST = route<{ id: string }>(({ request, params }) =>
  controller.markRead(request, params),
);
