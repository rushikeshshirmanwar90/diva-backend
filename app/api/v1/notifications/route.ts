import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { paginationMeta } from "@/lib/api/pagination";
import { parseQuery } from "@/lib/api/validate";
import { listNotificationsSchema } from "@/validators/notification";
import * as notificationService from "@/services/notification.service";
import { requireAuth } from "@/lib/auth/session";

/** This customer's own notifications, newest first. */
export const GET = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const query = parseQuery(request, listNotificationsSchema);

  const result = await notificationService.listForUser(principal.userId, query);

  return NextResponse.json(
    {
      success: true,
      status: 200,
      message: "Notifications fetched successfully",
      data: result.items,
      meta: {
        ...paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
        unreadCount: result.unreadCount,
      },
    },
    { status: 200 },
  );
});
