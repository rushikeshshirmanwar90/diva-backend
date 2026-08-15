import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/address.controller";

export const GET = route(({ request }) => controller.list(request));
export const POST = route(({ request }) => controller.create(request));
