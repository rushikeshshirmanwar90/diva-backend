import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as categoryService from "@/services/category.service";
import { getPrincipal } from "@/lib/auth/session";

/** Nested category tree for the storefront navigation. */
export const GET = route(async ({ request }) => {
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  const data = await categoryService.getCategoryTree({ includeInactive: isStaff });
  return NextResponse.json(
    { success: true, status: 200, message: "Category tree fetched successfully", data },
    { status: 200 },
  );
});
