import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as policyService from "@/services/policy.service";

/** Public. All policy pages, for the storefront's policies nav. */
export const GET = route(async () => {
  const data = await policyService.listPolicies();
  return NextResponse.json(
    { success: true, status: 200, message: "Policies fetched successfully", data },
    { status: 200 },
  );
});
