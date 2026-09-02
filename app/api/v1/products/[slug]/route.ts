import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { slugParam } from "@/validators/common";
import * as productService from "@/services/product.service";
import { getPrincipal } from "@/lib/auth/session";

/**
 * `GET /api/v1/products/:slug`
 *
 * Note that `params` is already awaited by the `route` wrapper — in Next 16 it
 * arrives as a Promise, and unwrapping it in one place keeps every handler from
 * having to remember.
 */
export const GET = route<{ slug: string }>(async ({ request, params }) => {
  const { slug } = parseParams(params, slugParam);
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  const data = await productService.getProductBySlug(slug, { isStaff });
  return NextResponse.json(
    { success: true, status: 200, message: "Product fetched successfully", data },
    { status: 200 },
  );
});
