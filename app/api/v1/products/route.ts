import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

/**
 * `GET /api/v1/products`
 *
 * The public listing. Filtering, sorting, pagination and facet counts all
 * arrive as query parameters — see `listProductsSchema`.
 */
export const GET = route(({ request }) => controller.listProducts(request));
