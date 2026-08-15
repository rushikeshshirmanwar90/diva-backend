import type { NextRequest } from "next/server";
import { ok, created } from "@/lib/api/response";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { createHeroSlideSchema, updateHeroSlideSchema } from "@/validators/hero";
import * as heroSlideService from "@/services/heroSlide.service";
import * as audit from "@/services/audit.service";
import { requireStaff, type Principal } from "@/lib/auth/session";
import { clientIp, userAgent } from "@/lib/http/request";

/**
 * HTTP shaping for the homepage hero carousel.
 *
 * Read is public — every visitor sees the same active slides. Every mutation
 * requires `content:write`, held by the catalog role and admin/superadmin;
 * see `lib/auth/rbac.ts`.
 */

function auditContext(request: NextRequest, principal: Principal): audit.AuditContext {
  return {
    principal,
    ip: clientIp(request),
    userAgent: userAgent(request),
    requestId: request.headers.get("x-request-id") ?? undefined,
  };
}

/** `GET /hero-slides` — public, active slides only, in display order. */
export async function list() {
  return ok(await heroSlideService.listActive());
}

/** `GET /admin/hero-slides` — every slide, including inactive ones. */
export async function listForAdmin(request: NextRequest) {
  await requireStaff(request, "content:write");
  return ok(await heroSlideService.listAll());
}

export async function create(request: NextRequest) {
  const principal = await requireStaff(request, "content:write");
  const input = await parseBody(request, createHeroSlideSchema);

  const slide = await heroSlideService.createSlide(input);

  audit.record(auditContext(request, principal), {
    action: "heroSlide.create",
    entityType: "HeroSlide",
    entityId: slide ? String(slide._id) : undefined,
    after: { heading: input.heading },
  });

  return created(slide);
}

export async function update(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "content:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateHeroSlideSchema);

  const slide = await heroSlideService.updateSlide(id, input);

  audit.record(auditContext(request, principal), {
    action: "heroSlide.update",
    entityType: "HeroSlide",
    entityId: id,
    after: input as Record<string, unknown>,
  });

  return ok(slide);
}

export async function remove(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "content:write");
  const { id } = parseParams(params, idParam);

  const result = await heroSlideService.deleteSlide(id);

  audit.record(auditContext(request, principal), {
    action: "heroSlide.delete",
    entityType: "HeroSlide",
    entityId: id,
  });

  return ok(result);
}
