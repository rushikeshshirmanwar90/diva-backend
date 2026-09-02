import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { addressInputSchema } from "@/validators/address";
import * as addressService from "@/services/address.service";
import { requireAuth } from "@/lib/auth/session";

/** The customer's saved addresses. Every route requires auth. */

export const GET = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const data = await addressService.list(principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Addresses fetched successfully", data },
    { status: 200 },
  );
});

export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const input = await parseBody(request, addressInputSchema);
  const data = await addressService.create(principal.userId, input);
  return NextResponse.json(
    { success: true, status: 201, message: "Address created successfully", data },
    { status: 201 },
  );
});
