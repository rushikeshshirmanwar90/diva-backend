import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as notificationService from "@/services/notification.service";
import { requireAuth } from "@/lib/auth/session";

export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const data = await notificationService.markAllRead(principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "All notifications marked as read", data },
    { status: 200 },
  );
});
