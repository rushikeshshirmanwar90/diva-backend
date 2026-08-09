import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions } from "@/models/base";
import { TICKET_STATUSES, type TicketStatus } from "@/models/enums";

/**
 * Support tickets and contact-form messages.
 *
 * `userId` is sparse on purpose: a visitor who cannot complete checkout is
 * exactly the person most in need of support, and they do not have an account
 * yet. Requiring one here would silence the most valuable feedback the site
 * receives.
 */

const threadMessageSchema = new mongoose.Schema(
  {
    body: { type: String, required: true, maxlength: 5000 },
    /** Absent when the message came from a guest via the contact form. */
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    authorName: { type: String, required: true },
    isStaff: { type: Boolean, default: false },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

export interface ContactMessageDocument {
  _id: Types.ObjectId;
  ticketNumber: string;
  userId?: Types.ObjectId | null;

  name: string;
  email: string;
  phone?: string;

  subject: string;
  /** Set when the ticket concerns a specific order. */
  orderId?: Types.ObjectId;

  status: TicketStatus;
  priority: "LOW" | "NORMAL" | "HIGH";
  assignedTo?: Types.ObjectId;

  thread: mongoose.InferSchemaType<typeof threadMessageSchema>[];

  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const contactMessageSchema = new mongoose.Schema<ContactMessageDocument>(
  {
    ticketNumber: { type: String, required: true, uppercase: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, sparse: true },

    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },

    subject: { type: String, required: true, trim: true, maxlength: 200 },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },

    status: { type: String, enum: TICKET_STATUSES, default: "OPEN", required: true },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH"], default: "NORMAL" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    thread: { type: [threadMessageSchema], default: [] },

    resolvedAt: { type: Date },
  },
  baseSchemaOptions,
);

contactMessageSchema.index({ ticketNumber: 1 }, { unique: true });
/** The support queue: open tickets, oldest first, so nothing rots. */
contactMessageSchema.index({ status: 1, createdAt: 1 });
contactMessageSchema.index({ userId: 1, createdAt: -1 });
contactMessageSchema.index({ email: 1, createdAt: -1 });

export const ContactMessageModel: Model<ContactMessageDocument> = defineModel(
  "ContactMessage",
  contactMessageSchema,
);
