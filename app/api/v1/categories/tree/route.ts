import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

/** Nested category tree for the storefront navigation. */
export const GET = route(({ request }) => controller.getCategoryTree(request));
