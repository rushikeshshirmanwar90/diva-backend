import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

export const GET = route(({ request }) => controller.listCategories(request));
