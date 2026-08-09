import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/checkout.controller";

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
export const POST = route(({ request }) => controller.reconcile(request));
