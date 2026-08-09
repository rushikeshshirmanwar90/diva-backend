import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/admin.controller";

export const GET = route<{ id: string }>(({ request, params }) =>
  controller.getCustomer(request, params),
);

export const PATCH = route<{ id: string }>(({ request, params }) =>
  controller.setCustomerActive(request, params),
);
