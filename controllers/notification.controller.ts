import type { NextRequest } from "next/server";
import { ok, paginationMeta } from "@/lib/api/response";
import { parseQuery, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { listNotificationsSchema } from "@/validators/notification";
import * as notificationService from "@/services/notification.service";
import { requireAuth } from "@/lib/auth/session";

/** `GET /notifications` — this customer's own, newest first. */
export async function list(request: NextRequest) {
  const principal = await requireAuth(request);
  const query = parseQuery(request, listNotificationsSchema);

  const result = await notificationService.listForUser(principal.userId, query);

  return ok(result.items, {
    meta: {
      ...paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
      unreadCount: result.unreadCount,
    },
  });
}

export async function markRead(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);

  return ok(await notificationService.markRead(id, principal.userId));
}

export async function markAllRead(request: NextRequest) {
  const principal = await requireAuth(request);
  return ok(await notificationService.markAllRead(principal.userId));
}
