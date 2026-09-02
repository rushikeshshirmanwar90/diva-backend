import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { setCustomerActiveSchema } from "@/validators/admin";
import * as customerService from "@/services/customer.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const GET = route<{ id: string }>(async ({ request, params }) => {
  await requireStaff(request, "customer:read");
  const { id } = parseParams(params, idParam);
  const data = await customerService.getCustomer(id);
  return NextResponse.json(
    { success: true, status: 200, message: "Customer fetched successfully", data },
    { status: 200 },
  );
});

export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "customer:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, setCustomerActiveSchema);

  const customer = await customerService.setCustomerActive(id, input.isActive);

  audit.record(audit.auditContext(request, principal), {
    action: input.isActive ? "customer.restore" : "customer.suspend",
    entityType: "User",
    entityId: id,
    after: { isActive: input.isActive },
  });

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: input.isActive ? "Customer restored successfully" : "Customer suspended successfully",
      data: customer,
    },
    { status: 200 },
  );
});
