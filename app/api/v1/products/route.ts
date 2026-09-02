import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { paginationMeta } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validate";
import { listProductsSchema } from "@/validators/catalog";
import * as productService from "@/services/product.service";
import { getPrincipal } from "@/lib/auth/session";

/**
 * `GET /api/v1/products`
 *
 * The public listing. Filtering, sorting, pagination and facet counts all
 * arrive as query parameters — see `listProductsSchema`.
 *
 * The recurring `isStaff` flag is what separates the public and admin views of
 * the same endpoint. A draft product is invisible to a shopper and visible to
 * an admin, and that is decided from the verified principal, never from a
 * query parameter a caller could set.
 */
export const GET = route(async ({ request }) => {
  const query = parseQuery(request, listProductsSchema);
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  const result = await productService.listProducts(query, { isStaff });

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Products fetched successfully",
      data: result.items,
      meta: {
        ...paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
        facets: result.facets,
      },
    },
    { status: 200 },
  );
});
