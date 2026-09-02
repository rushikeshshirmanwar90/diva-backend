import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { updatePolicySchema } from "@/validators/policy";
import * as policyService from "@/services/policy.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const GET = route<{ slug: string }>(async ({ request, params }) => {
  await requireStaff(request, "content:write");
  const data = await policyService.getPolicy(params.slug);
  return NextResponse.json(
    { success: true, status: 200, message: "Policy fetched successfully", data },
    { status: 200 },
  );
});

export const PATCH = route<{ slug: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "content:write");
  const input = await parseBody(request, updatePolicySchema);

  const updated = await policyService.updatePolicy(params.slug, input);

  audit.record(audit.auditContext(request, principal), {
    action: "policy.update",
    entityType: "Policy",
    entityId: String(updated._id),
    after: { slug: params.slug, ...input },
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Policy updated successfully", data: updated },
    { status: 200 },
  );
});
