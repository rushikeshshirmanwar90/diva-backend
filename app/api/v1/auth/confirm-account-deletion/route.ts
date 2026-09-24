import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { confirmAccountDeletionSchema } from "@/validators/auth";
import * as authService from "@/services/auth.service";

export const POST = route(async ({ request }) => {
  const input = await parseBody(request, confirmAccountDeletionSchema);
  const data = await authService.confirmAccountDeletion(input.token);
  return NextResponse.json(
    { success: true, status: 200, message: "Account deleted successfully", data },
    { status: 200 },
  );
});
