import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { requireStaff } from "@/lib/auth/session";
import * as policyService from "@/services/policy.service";

/** Admin list — same content:write permission as hero slides and other storefront copy. */
export const GET = route(async ({ request }) => {
  await requireStaff(request, "content:write");
  const data = await policyService.listPolicies();
  return NextResponse.json(
    { success: true, status: 200, message: "Policies fetched successfully", data },
    { status: 200 },
  );
});
