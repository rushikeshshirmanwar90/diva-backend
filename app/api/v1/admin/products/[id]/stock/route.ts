import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { updateStockSchema } from "@/validators/catalog";
import * as productService from "@/services/product.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

/**
 * `PATCH /api/v1/admin/products/:id/stock`
 *
 * Separate from the product update because stock changes far more often than
 * anything else on a product, and routing it through the full update payload
 * would mean sending every variant back to change one number.
 */
export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateStockSchema);

  const data = await productService.updateStock(id, input.variantId, input.stock);

  audit.record(audit.auditContext(request, principal), {
    action: "product.stock_update",
    entityType: "Product",
    entityId: id,
    after: { variantId: input.variantId, stock: input.stock },
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Stock updated successfully", data },
    { status: 200 },
  );
});
