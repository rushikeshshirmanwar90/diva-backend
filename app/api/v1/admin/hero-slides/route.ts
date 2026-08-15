import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/heroSlide.controller";

export const GET = route(({ request }) => controller.listForAdmin(request));
export const POST = route(({ request }) => controller.create(request));
