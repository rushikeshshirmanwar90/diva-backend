import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

export const PATCH = route<{ id: string }>(({ request, params }) =>
  controller.updateCollection(request, params),
);

export const DELETE = route<{ id: string }>(({ request, params }) =>
  controller.deleteCollection(request, params),
);
