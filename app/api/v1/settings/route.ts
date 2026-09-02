import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as settingService from "@/services/setting.service";

/** Public. Contact/store details for the storefront's footer, contact page, and policies. */
export const GET = route(async () => {
  const data = await settingService.getPublicSettings();
  return NextResponse.json(
    { success: true, status: 200, message: "Store settings fetched successfully", data },
    { status: 200 },
  );
});
