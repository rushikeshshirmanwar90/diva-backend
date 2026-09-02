import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { updateProfileSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";
import { requireAuth } from "@/lib/auth/session";

export const GET = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const data = await authService.getProfile(principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Profile fetched successfully", data },
    { status: 200 },
  );
});

export const PATCH = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const input = await parseBody(request, updateProfileSchema);
  const data = await authService.updateProfile(principal.userId, input);
  return NextResponse.json(
    { success: true, status: 200, message: "Profile updated successfully", data },
    { status: 200 },
  );
});
