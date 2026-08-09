import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/admin.controller";

/** Aggregates for the admin Overview. Catalogue and customers only — no order data exists yet. */
export const GET = route(({ request }) => controller.getStats(request));
