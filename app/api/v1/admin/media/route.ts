import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

/**
 * `GET /api/v1/admin/media`
 *
 * Every image the catalogue already references, deduplicated — the pool an
 * admin picks from when reusing a photo instead of uploading it again.
 *
 * Assembled from products, categories and collections rather than fetched from
 * Cloudinary: listing an account's assets is the Admin API, which needs the
 * secret this deployment does not hold. The response says so via
 * `cloudBrowsingAvailable` so the UI can explain the gap instead of looking
 * broken.
 */
export const GET = route(({ request }) => controller.listMedia(request));
