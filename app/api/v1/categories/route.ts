import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/validate";
import { listCategoriesSchema } from "@/validators/catalog";
import * as categoryService from "@/services/category.service";
import { getPrincipal } from "@/lib/auth/session";

export const GET = route(async ({ request }) => {
  const query = parseQuery(request, listCategoriesSchema);
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  const data = await categoryService.listCategories({
    ...query,
    // Inactive categories are staff-only regardless of what was asked for.
    includeInactive: isStaff && query.includeInactive,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Categories fetched successfully", data },
    { status: 200 },
  );
});
