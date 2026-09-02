import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import * as notificationService from "@/services/notification.service";
import { requireAuth } from "@/lib/auth/session";

export const POST = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);
  const data = await notificationService.markRead(id, principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Notification marked as read", data },
    { status: 200 },
  );
});
