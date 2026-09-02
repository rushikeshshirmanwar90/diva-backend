import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { updateAddressSchema } from "@/validators/address";
import * as addressService from "@/services/address.service";
import { requireAuth } from "@/lib/auth/session";

export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateAddressSchema);
  const data = await addressService.update(id, principal.userId, input);
  return NextResponse.json(
    { success: true, status: 200, message: "Address updated successfully", data },
    { status: 200 },
  );
});

export const DELETE = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);
  const data = await addressService.remove(id, principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Address deleted successfully", data },
    { status: 200 },
  );
});
