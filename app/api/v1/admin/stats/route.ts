import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as dashboardService from "@/services/dashboard.service";
import { requireAuth } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/errors";
import { can } from "@/lib/auth/rbac";

/**
 * Aggregates for the admin Overview.
 *
 * Not `requireStaff(..., permission)`: the screen is useful to every staff
 * role, but shows different halves to each. Catalogue readers see stock and
 * drafts; order readers additionally get revenue and the fulfilment pipeline.
 * A support agent with neither would be the only 403, and no such role exists.
 */
export const GET = route(async ({ request }) => {
  const principal = await requireAuth(request);

  if (principal.transport === "cookie" && principal.audience !== "admin") {
    throw ApiError.forbidden("Admin actions must be performed from the admin console.");
  }
  if (principal.role === "customer") {
    throw ApiError.forbidden("This area is restricted to staff accounts.");
  }

  const canReadOrders = can(principal.role, "order:read");
  if (!canReadOrders && !can(principal.role, "catalog:read")) {
    throw ApiError.forbidden('This screen requires the "catalog:read" or "order:read" permission.');
  }

  const data = await dashboardService.getDashboardStats({ includeSales: canReadOrders });

  return NextResponse.json(
    { success: true, status: 200, message: "Dashboard stats fetched successfully", data },
    { status: 200 },
  );
});
