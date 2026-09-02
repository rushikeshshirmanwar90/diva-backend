import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as paymentService from "@/services/payment.service";
import { requireStaff } from "@/lib/auth/session";

/**
 * Sweeps payments stuck in flight and asks PhonePe what happened.
 *
 * Point a scheduler at this every five minutes. It is what rescues orders whose
 * webhook was never delivered — which is not a rare event, and without it those
 * customers have paid and receive nothing until someone notices.
 *
 * Staff-authenticated, so a scheduler needs a service account rather than an
 * open URL.
 */
export const POST = route(async ({ request }) => {
  await requireStaff(request, "payment:read");
  const data = await paymentService.reconcileStalePayments();
  return NextResponse.json(
    { success: true, status: 200, message: "Reconciliation completed successfully", data },
    { status: 200 },
  );
});
