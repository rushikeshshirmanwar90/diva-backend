import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/validate";
import { serviceabilitySchema } from "@/validators/checkout";
import * as shippingService from "@/services/shipping.service";

/**
 * `GET /api/v1/shipping/serviceability?pincode=560001&cartValuePaise=4899900`
 *
 * Public, and called from the address step. Answering "we cannot deliver there"
 * before payment is the whole point: finding out afterwards means refunding a
 * completed order.
 */
export const GET = route(async ({ request }) => {
  const query = parseQuery(request, serviceabilitySchema);
  const data = await shippingService.checkServiceability({
    pincode: query.pincode,
    cartValuePaise: query.cartValuePaise,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Serviceability checked successfully", data },
    { status: 200 },
  );
});
