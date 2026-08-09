import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

/**
 * `GET /api/v1/shipping/serviceability?pincode=560001&cartValuePaise=4899900`
 *
 * Public, and called from the address step. Answering "we cannot deliver there"
 * before payment is the whole point: finding out afterwards means refunding a
 * completed order.
 */
export const GET = route(({ request }) => controller.serviceability(request));
