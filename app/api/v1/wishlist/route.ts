import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/wishlist.controller";

export const GET = route(({ request }) => controller.list(request));
export const POST = route(({ request }) => controller.add(request));
