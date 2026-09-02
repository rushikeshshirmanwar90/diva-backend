import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { merchantTransactionParam } from "@/validators/checkout";
import * as paymentService from "@/services/payment.service";
import { requireAuth } from "@/lib/auth/session";

/**
 * Live status for one payment attempt, read from PhonePe.
 *
 * The return page polls this while a payment settles. It queries the gateway
 * rather than the database because the customer is usually back before the
 * webhook has landed.
 */
export const GET = route<{ merchantTransactionId: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { merchantTransactionId } = parseParams(params, merchantTransactionParam);
  const data = await paymentService.checkStatus(merchantTransactionId, {
    userId: principal.userId,
  });
  return NextResponse.json(
    { success: true, status: 200, message: "Payment status fetched successfully", data },
    { status: 200 },
  );
});
