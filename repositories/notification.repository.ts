import { NotificationModel, type NotificationDocument } from "@/models/Notification";

/** The bell-icon query: this user's notifications, newest first. */
export async function listForUser(userId: string, options: { page: number; limit: number }) {
  const filter = { userId };

  const [items, total, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ userId, readAt: null }),
  ]);

  return { items, total, unreadCount };
}

export async function markRead(id: string, userId: string) {
  return NotificationModel.findOneAndUpdate(
    { _id: id, userId },
    { $set: { readAt: new Date() } },
    { returnDocument: "after" },
  ).lean();
}

export async function markAllRead(userId: string): Promise<void> {
  await NotificationModel.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
}

export async function create(input: Partial<NotificationDocument>) {
  return NotificationModel.create(input);
}
