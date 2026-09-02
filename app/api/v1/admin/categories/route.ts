import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { createCategorySchema } from "@/validators/catalog";
import * as categoryService from "@/services/category.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const POST = route(async ({ request }) => {
  const principal = await requireStaff(request, "catalog:write");
  const input = await parseBody(request, createCategorySchema);

  const category = await categoryService.createCategory(input);

  audit.record(audit.auditContext(request, principal), {
    action: "category.create",
    entityType: "Category",
    entityId: category ? String(category._id) : undefined,
    after: { name: input.name },
  });

  return NextResponse.json(
    { success: true, status: 201, message: "Category created successfully", data: category },
    { status: 201 },
  );
});
