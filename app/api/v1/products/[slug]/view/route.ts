import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { slugParam } from "@/validators/common";
import { productViewSchema } from "@/validators/analytics";
import * as analyticsService from "@/services/analytics.service";
import { getPrincipal } from "@/lib/auth/session";

/**
 * `POST /api/v1/products/:slug/view`
 *
 * A fire-and-forget beacon from the storefront's product page. Public — a
 * visitor browsing without an account is exactly who this counts. Staff
 * sessions are skipped so an admin checking their own listing does not show
 * up as a customer.
 */
export const POST = route<{ slug: string }>(async ({ request, params }) => {
  const { slug } = parseParams(params, slugParam);
  const input = await parseBody(request, productViewSchema);
  const principal = await getPrincipal(request);

  if (principal && principal.role !== "customer") {
    return NextResponse.json(
      { success: true, status: 202, message: "Staff view ignored", data: { recorded: false } },
      { status: 202 },
    );
  }

  const data = await analyticsService.recordProductView(slug, input, {
    userId: principal?.userId ?? null,
  });

  return NextResponse.json(
    { success: true, status: 202, message: "View recorded", data },
    { status: 202 },
  );
});
