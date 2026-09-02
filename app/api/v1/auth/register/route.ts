import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { registerSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";

export const POST = route(async ({ request }) => {
  const input = await parseBody(request, registerSchema);
  const data = await authService.register(input);
  return NextResponse.json(
    { success: true, status: 201, message: "Registration successful. Please verify your email.", data },
    { status: 201 },
  );
});
