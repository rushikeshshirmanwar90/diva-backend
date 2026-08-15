import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/address.controller";

export const PATCH = route<{ id: string }>(({ request, params }) =>
  controller.update(request, params),
);

export const DELETE = route<{ id: string }>(({ request, params }) =>
  controller.remove(request, params),
);
