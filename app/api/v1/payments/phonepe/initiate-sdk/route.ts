import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { initiatePaymentSchema } from "@/validators/checkout";
import * as paymentService from "@/services/payment.service";
import { requireAuth } from "@/lib/auth/session";

/**
 * `POST /api/v1/payments/phonepe/initiate-sdk`
 *
 * Returns `{ merchantId, merchantTransactionId, base64Body, checksum, environment }`
 * for the React Native PhonePe SDK (react-native-phonepe-pg) startTransaction() flow.
 */
export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const { orderNumber } = await parseBody(request, initiatePaymentSchema);
  const data = await paymentService.initiatePaymentSDK(orderNumber, {
    userId: principal.userId,
  });
  return NextResponse.json(
    { success: true, status: 200, message: "SDK payment initiated successfully", data },
    { status: 200 },
  );
});
