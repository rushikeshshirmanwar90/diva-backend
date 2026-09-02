import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { refundSchema } from "@/validators/checkout";
import * as paymentService from "@/services/payment.service";
import { requireStaff } from "@/lib/auth/session";

/**
 * Full or partial refund. Requires `payment:refund`, which only `finance`,
 * `admin` and `superadmin` hold.
 *
 * There is deliberately no customer-facing equivalent.
 */
export const POST = route(async ({ request }) => {
  const principal = await requireStaff(request, "payment:refund");
  const input = await parseBody(request, refundSchema);

  const data = await paymentService.refundOrder({
    orderNumber: input.orderNumber,
    amountPaise: input.amountPaise,
    reason: input.reason,
    actorId: principal.userId,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Refund initiated successfully", data },
    { status: 200 },
  );
});
