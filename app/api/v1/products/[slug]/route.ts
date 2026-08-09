import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

/**
 * `GET /api/v1/products/:slug`
 *
 * Note that `params` is already awaited by the `route` wrapper — in Next 16 it
 * arrives as a Promise, and unwrapping it in one place keeps every handler from
 * having to remember.
 */
export const GET = route<{ slug: string }>(({ request, params }) =>
  controller.getProduct(request, params),
);
