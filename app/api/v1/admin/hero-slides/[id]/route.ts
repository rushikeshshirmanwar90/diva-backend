import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { updateHeroSlideSchema } from "@/validators/hero";
import * as heroSlideService from "@/services/heroSlide.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "content:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateHeroSlideSchema);

  const slide = await heroSlideService.updateSlide(id, input);

  audit.record(audit.auditContext(request, principal), {
    action: "heroSlide.update",
    entityType: "HeroSlide",
    entityId: id,
    after: input as Record<string, unknown>,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Hero slide updated successfully", data: slide },
    { status: 200 },
  );
});

export const DELETE = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "content:write");
  const { id } = parseParams(params, idParam);

  const data = await heroSlideService.deleteSlide(id);

  audit.record(audit.auditContext(request, principal), {
    action: "heroSlide.delete",
    entityType: "HeroSlide",
    entityId: id,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Hero slide deleted successfully", data },
    { status: 200 },
  );
});
