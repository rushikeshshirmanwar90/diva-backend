import type { NextRequest } from "next/server";
import { ok, paginationMeta } from "@/lib/api/response";
import { parseBody, parseQuery, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { listCustomersSchema, setCustomerActiveSchema } from "@/validators/admin";
import * as dashboardService from "@/services/dashboard.service";
import * as customerService from "@/services/customer.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";
import { clientIp, userAgent } from "@/lib/http/request";
import * as products from "@/repositories/product.repository";
import { ApiError } from "@/lib/api/errors";

/**
 * Endpoints that exist for the admin console specifically.
 *
 * Split from `catalog.controller.ts` because these have no storefront
 * counterpart — the dashboard aggregate and the customer list are staff-only by
 * nature, whereas the catalogue endpoints serve both audiences with different
 * visibility.
 */

export async function getStats(request: NextRequest) {
  await requireStaff(request, "catalog:read");
  return ok(await dashboardService.getDashboardStats());
}

export async function listCustomers(request: NextRequest) {
  await requireStaff(request, "customer:read");

  const query = parseQuery(request, listCustomersSchema);
  const result = await customerService.listCustomers(query);

  return ok(result.items, {
    meta: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
  });
}

export async function getCustomer(request: NextRequest, params: unknown) {
  await requireStaff(request, "customer:read");
  const { id } = parseParams(params, idParam);

  return ok(await customerService.getCustomer(id));
}

export async function setCustomerActive(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "customer:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, setCustomerActiveSchema);

  const customer = await customerService.setCustomerActive(id, input.isActive);

  audit.record(
    {
      principal,
      ip: clientIp(request),
      userAgent: userAgent(request),
      requestId: request.headers.get("x-request-id") ?? undefined,
    },
    {
      action: input.isActive ? "customer.restore" : "customer.suspend",
      entityType: "User",
      entityId: id,
      after: { isActive: input.isActive },
    },
  );

  return ok(customer);
}

/**
 * Product fetched by id, including drafts.
 *
 * The public detail endpoint is keyed by slug and hides non-active products —
 * correct for shoppers, useless for an edit form that has to load a draft. This
 * returns the raw stored document rather than the priced view, because the
 * editor needs the *inputs* (weights, charges) not the computed output.
 */
export async function getProductForEdit(request: NextRequest, params: unknown) {
  await requireStaff(request, "catalog:read");
  const { id } = parseParams(params, idParam);

  const product = await products.findById(id);
  if (!product) throw ApiError.notFound("We could not find that product.");

  return ok(product);
}
