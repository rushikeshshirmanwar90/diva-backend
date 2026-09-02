import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as dashboardService from "@/services/dashboard.service";
import { requireStaff } from "@/lib/auth/session";

/** Aggregates for the admin Overview. Catalogue and customers only — no order data exists yet. */
export const GET = route(async ({ request }) => {
  await requireStaff(request, "catalog:read");
  const data = await dashboardService.getDashboardStats();
  return NextResponse.json(
    { success: true, status: 200, message: "Dashboard stats fetched successfully", data },
    { status: 200 },
  );
});
