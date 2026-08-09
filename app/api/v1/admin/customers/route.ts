import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/admin.controller";

export const GET = route(({ request }) => controller.listCustomers(request));
