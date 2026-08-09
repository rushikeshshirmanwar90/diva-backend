import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

/**
 * `POST /api/v1/admin/media/import`
 *
 * Turns a pasted Cloudinary delivery URL into an attachable asset, for images
 * that exist in the account but have never been used here — including anything
 * another project sharing the cloud uploaded.
 *
 * Restricted to `res.cloudinary.com` on the store's own cloud: an image hosted
 * somewhere we do not control vanishes the day a stranger deletes it, and a
 * product page with a dead hero image is a lost sale nobody gets alerted about.
 */
export const POST = route(({ request }) => controller.importImage(request));
