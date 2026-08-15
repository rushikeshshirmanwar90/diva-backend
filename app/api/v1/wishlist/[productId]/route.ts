import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/wishlist.controller";

export const DELETE = route<{ productId: string }>(({ request, params }) =>
  controller.remove(request, params),
);
