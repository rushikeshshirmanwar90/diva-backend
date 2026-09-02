import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as policyService from "@/services/policy.service";

/** Public. One policy page by slug ("shipping" or "returns"). */
export const GET = route<{ slug: string }>(async ({ params }) => {
  const data = await policyService.getPolicy(params.slug);
  return NextResponse.json(
    { success: true, status: 200, message: "Policy fetched successfully", data },
    { status: 200 },
  );
});
