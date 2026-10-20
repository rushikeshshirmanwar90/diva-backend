import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { env } from "@/config/env";
import { safeEqual } from "@/lib/auth/tokens";
import * as paymentService from "@/services/payment.service";
import { requireStaff } from "@/lib/auth/session";

/**
 * Sweeps payments stuck in flight and asks PhonePe what happened, then
 * releases the stock still held by checkouts that were never paid for.
 *
 * Point a scheduler at this every five minutes. It is what rescues orders whose
 * webhook was never delivered — which is not a rare event, and without it those
 * customers have paid and receive nothing until someone notices. It is also
 * the only thing that puts stock back when a customer abandons the PhonePe
 * page: the gateway reports that as PENDING, not FAILED, until it expires.
 *
 * Two ways in. POST is staff-authenticated, for the admin console and for a
 * scheduler holding a service account. GET is for Vercel Cron, which can only
 * send `Authorization: Bearer <CRON_SECRET>` — it is refused outright when
 * `CRON_SECRET` is unset.
 */
async function runSweeps() {
  const payments = await paymentService.reconcileStalePayments();
  const reservations = await paymentService.releaseExpiredReservations();

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Reconciliation completed successfully",
      data: { ...payments, reservations },
    },
    { status: 200 },
  );
}

export const POST = route(async ({ request }) => {
  await requireStaff(request, "payment:read");
  return runSweeps();
});

export const GET = route(async ({ request }) => {
  const header = request.headers.get("authorization") ?? "";

  if (!env.CRON_SECRET || !safeEqual(header, `Bearer ${env.CRON_SECRET}`)) {
    throw ApiError.unauthenticated("Invalid cron secret");
  }

  return runSweeps();
});
