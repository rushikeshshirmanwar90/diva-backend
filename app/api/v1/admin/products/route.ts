import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

export const POST = route(({ request }) => controller.createProduct(request));
