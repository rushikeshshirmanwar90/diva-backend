import { ApiError } from "@/lib/api/errors";
import * as notifications from "@/repositories/notification.repository";
import type { NotificationType } from "@/models/enums";

export async function listForUser(userId: string, options: { page: number; limit: number }) {
  return notifications.listForUser(userId, options);
}

export async function markRead(id: string, userId: string) {
  const updated = await notifications.markRead(id, userId);
  if (!updated) throw ApiError.notFound("We could not find that notification.");
  return updated;
}

export async function markAllRead(userId: string) {
  await notifications.markAllRead(userId);
  return { marked: true };
}

/**
 * Called by other services at the moment something worth telling a customer
 * happens — order placed, cancelled, and so on. Never called from a route
 * directly.
 *
 * Swallows its own failure. A notification is a courtesy; the order,
 * cancellation or whatever triggered it has already happened and must not be
 * undone because a write to an unrelated collection failed.
 */
export async function notify(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await notifications.create(input as never).catch((error: unknown) => {
    console.error("[notification] failed to create:", error);
  });
}
