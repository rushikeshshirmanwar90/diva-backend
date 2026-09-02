import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { importImageSchema } from "@/validators/catalog";
import * as mediaService from "@/services/media.service";
import { requireStaff } from "@/lib/auth/session";

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
export const POST = route(async ({ request }) => {
  await requireStaff(request, "catalog:write");
  const input = await parseBody(request, importImageSchema);
  const data = await mediaService.importByUrl(input);
  return NextResponse.json(
    { success: true, status: 200, message: "Image imported successfully", data },
    { status: 200 },
  );
});
