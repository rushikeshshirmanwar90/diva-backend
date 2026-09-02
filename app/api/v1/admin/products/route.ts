import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { createProductSchema } from "@/validators/catalog";
import * as productService from "@/services/product.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const POST = route(async ({ request }) => {
  const principal = await requireStaff(request, "catalog:write");
  const input = await parseBody(request, createProductSchema);

  const product = await productService.createProduct(input, principal.userId);

  audit.record(audit.auditContext(request, principal), {
    action: "product.create",
    entityType: "Product",
    entityId: String(product._id),
    after: { title: product.title, slug: product.slug, status: product.status },
  });

  return NextResponse.json(
    { success: true, status: 201, message: "Product created successfully", data: product },
    { status: 201 },
  );
});
