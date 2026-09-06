import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { initiatePaymentSchema } from "@/validators/checkout";
import * as paymentService from "@/services/payment.service";
import { requireAuth } from "@/lib/auth/session";

/**
 * `POST /api/v1/payments/phonepe/initiate`
 *
 * Returns `{ redirectUrl }` — send the browser there. The amount comes from the
 * stored order, never from the request, so there is nothing here for a client
 * to tamper with.
 */
export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const { orderNumber } = await parseBody(request, initiatePaymentSchema);
  const data = await paymentService.initiatePayment(
    orderNumber,
    { userId: principal.userId },
    { origin: request.headers.get("origin") },
  );
  return NextResponse.json(
    { success: true, status: 200, message: "Payment initiated successfully", data },
    { status: 200 },
  );
});
