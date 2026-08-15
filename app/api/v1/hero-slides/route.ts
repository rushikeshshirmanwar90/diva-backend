import { route } from "@/lib/api/handler";
import * as controller from "@/controllers/heroSlide.controller";

export const GET = route(() => controller.list());
