import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/validate";
import { listMediaSchema } from "@/validators/catalog";
import * as mediaService from "@/services/media.service";
import { requireStaff } from "@/lib/auth/session";

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
 *
 * `catalog:read` rather than `catalog:write`: browsing what exists is a read,
 * and support staff looking at an order should be able to see the same imagery
 * a customer does.
 */
export const GET = route(async ({ request }) => {
  await requireStaff(request, "catalog:read");
  const query = parseQuery(request, listMediaSchema);
  const data = await mediaService.listLibrary(query);
  return NextResponse.json(
    { success: true, status: 200, message: "Media library fetched successfully", data },
    { status: 200 },
  );
});
