import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as heroSlideService from "@/services/heroSlide.service";

/** Public, active slides only, in display order. */
export const GET = route(async () => {
  const data = await heroSlideService.listActive();
  return NextResponse.json(
    { success: true, status: 200, message: "Hero slides fetched successfully", data },
    { status: 200 },
  );
});
