import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

/**
 * `PATCH /api/v1/admin/products/:id/stock`
 *
 * Separate from the product update because stock changes far more often than
 * anything else on a product, and routing it through the full update payload
 * would mean sending every variant back to change one number.
 */
export const PATCH = route<{ id: string }>(({ request, params }) =>
  controller.updateStock(request, params),
);
