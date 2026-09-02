import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/validate";
import { uploadSignatureSchema } from "@/validators/catalog";
import * as uploadService from "@/services/upload.service";
import { requireStaff } from "@/lib/auth/session";

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
export const POST = route(async ({ request }) => {
  await requireStaff(request, "catalog:write");
  const { folder } = parseQuery(request, uploadSignatureSchema);
  const data = await uploadService.requestSignature(folder);
  return NextResponse.json(
    { success: true, status: 200, message: "Upload signature generated successfully", data },
    { status: 200 },
  );
});
