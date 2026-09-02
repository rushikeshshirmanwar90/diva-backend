import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { updateProductSchema } from "@/validators/catalog";
import * as productService from "@/services/product.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/errors";
import * as products from "@/repositories/product.repository";

/**
 * Fetched by id and includes drafts — the public `/products/:slug` endpoint
 * deliberately hides anything not ACTIVE, which makes it useless for an editor.
 *
 * Returns the raw stored document rather than the priced view, because the
 * editor needs the *inputs* (weights, charges) not the computed output.
 */
export const GET = route<{ id: string }>(async ({ request, params }) => {
  await requireStaff(request, "catalog:read");
  const { id } = parseParams(params, idParam);

  const product = await products.findById(id);
  if (!product) throw ApiError.notFound("We could not find that product.");

  return NextResponse.json(
    { success: true, status: 200, message: "Product fetched successfully", data: product },
    { status: 200 },
  );
});

export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateProductSchema);

  const product = await productService.updateProduct(id, input);

  audit.record(audit.auditContext(request, principal), {
    action: "product.update",
    entityType: "Product",
    entityId: id,
    after: input as Record<string, unknown>,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Product updated successfully", data: product },
    { status: 200 },
  );
});

export const DELETE = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);

  const data = await productService.deleteProduct(id);

  audit.record(audit.auditContext(request, principal), {
    action: "product.delete",
    entityType: "Product",
    entityId: id,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Product deleted successfully", data },
    { status: 200 },
  );
});
