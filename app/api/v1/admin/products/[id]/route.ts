import { route } from "@/lib/api/handler";
import * as catalog from "@/controllers/catalog.controller";
import * as admin from "@/controllers/admin.controller";

/**
 * Fetched by id and includes drafts — the public `/products/:slug` endpoint
 * deliberately hides anything not ACTIVE, which makes it useless for an editor.
 */
export const GET = route<{ id: string }>(({ request, params }) =>
  admin.getProductForEdit(request, params),
);

export const PATCH = route<{ id: string }>(({ request, params }) =>
  catalog.updateProduct(request, params),
);

export const DELETE = route<{ id: string }>(({ request, params }) =>
  catalog.deleteProduct(request, params),
);
