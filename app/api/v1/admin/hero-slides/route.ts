import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { createHeroSlideSchema } from "@/validators/hero";
import * as heroSlideService from "@/services/heroSlide.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

/**
 * The homepage hero carousel, admin side. Every mutation requires
 * `content:write`, held by the catalog role and admin/superadmin; see
 * `lib/auth/rbac.ts`.
 */

/** Every slide, including inactive ones. */
export const GET = route(async ({ request }) => {
  await requireStaff(request, "content:write");
  const data = await heroSlideService.listAll();
  return NextResponse.json(
    { success: true, status: 200, message: "Hero slides fetched successfully", data },
    { status: 200 },
  );
});

export const POST = route(async ({ request }) => {
  const principal = await requireStaff(request, "content:write");
  const input = await parseBody(request, createHeroSlideSchema);

  const slide = await heroSlideService.createSlide(input);

  audit.record(audit.auditContext(request, principal), {
    action: "heroSlide.create",
    entityType: "HeroSlide",
    entityId: slide ? String(slide._id) : undefined,
    after: { heading: input.heading },
  });

  return NextResponse.json(
    { success: true, status: 201, message: "Hero slide created successfully", data: slide },
    { status: 201 },
  );
});
