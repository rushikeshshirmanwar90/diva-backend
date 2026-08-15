import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/heroSlide.controller";

export const PATCH = route<{ id: string }>(({ request, params }) =>
  controller.update(request, params),
);

export const DELETE = route<{ id: string }>(({ request, params }) =>
  controller.remove(request, params),
);
