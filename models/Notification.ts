import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions } from "@/models/base";
import { NOTIFICATION_TYPES, type NotificationType } from "@/models/enums";

/**
 * In-app notifications.
 *
 * Written **before** the corresponding email is queued, and independently of
 * whether that email succeeds. The rule from the mail layer applies in reverse
 * here: because a failed SMTP call must never fail an order, the in-app
 * notification is the source of truth for "the customer was told". If Gmail
 * bounces the shipping email, the notification is still in their account.
 */

export interface NotificationDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep link — a path, not an absolute URL, so web and mobile can both route it. */
  link?: string;
  /** Type-specific extras: order number, product slug, amount. */
  payload?: Record<string, unknown>;
  readAt?: Date | null;
  /** TTL. Notifications are transient; they are not an archive. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new mongoose.Schema<NotificationDocument>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    link: { type: String, trim: true, maxlength: 300 },
    payload: { type: mongoose.Schema.Types.Mixed },
    readAt: { type: Date, default: null },
    expiresAt: {
      type: Date,
      required: true,
      // Ninety days. Long enough to cover a delivery dispute, short enough that
      // this collection does not grow without bound.
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  },
  baseSchemaOptions,
);

/** The bell-icon query: this user's notifications, newest first. */
notificationSchema.index({ userId: 1, createdAt: -1 });

/**
 * Unread badge count.
 *
 * Partial index over unread rows only — the badge query never looks at read
 * notifications, and excluding them keeps the index small as history grows.
 */
notificationSchema.index(
  { userId: 1, readAt: 1 },
  { partialFilterExpression: { readAt: null } },
);

notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationModel: Model<NotificationDocument> = defineModel(
  "Notification",
  notificationSchema,
);
