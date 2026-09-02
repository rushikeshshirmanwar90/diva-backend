import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { updateCategorySchema } from "@/validators/catalog";
import * as categoryService from "@/services/category.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateCategorySchema);

  const category = await categoryService.updateCategory(id, input);

  audit.record(audit.auditContext(request, principal), {
    action: "category.update",
    entityType: "Category",
    entityId: id,
    after: input as Record<string, unknown>,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Category updated successfully", data: category },
    { status: 200 },
  );
});

export const DELETE = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);

  const data = await categoryService.deleteCategory(id);

  audit.record(audit.auditContext(request, principal), {
    action: "category.delete",
    entityType: "Category",
    entityId: id,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Category deleted successfully", data },
    { status: 200 },
  );
});
