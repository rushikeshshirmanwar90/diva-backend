import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/catalog.controller";

/**
 * `POST /api/v1/uploads/signature`
 *
 * Returns a short-lived signature the browser posts directly to Cloudinary.
 * The file never passes through this server. See lib/cloudinary/upload.ts.
 *
 * **Currently unused.** The admin switched to unsigned preset uploads on
 * 2026-08-08 (no API secret available for the shared `dlcq8i2sc` account), so
 * this returns 503 until `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` are
 * set. Retained deliberately: it is the whole server side of the migration
 * back to signed uploads.
 */
export const POST = route(({ request }) => controller.createUploadSignature(request));
