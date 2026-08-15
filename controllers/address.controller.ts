import type { NextRequest } from "next/server";
import { ok, created } from "@/lib/api/response";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { addressInputSchema, updateAddressSchema } from "@/validators/address";
import * as addressService from "@/services/address.service";
import { requireAuth } from "@/lib/auth/session";

/** HTTP shaping for the customer's saved addresses. Every route requires auth. */

export async function list(request: NextRequest) {
  const principal = await requireAuth(request);
  return ok(await addressService.list(principal.userId));
}

export async function create(request: NextRequest) {
  const principal = await requireAuth(request);
  const input = await parseBody(request, addressInputSchema);

  return created(await addressService.create(principal.userId, input));
}

export async function update(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateAddressSchema);

  return ok(await addressService.update(id, principal.userId, input));
}

export async function remove(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);

  return ok(await addressService.remove(id, principal.userId));
}
