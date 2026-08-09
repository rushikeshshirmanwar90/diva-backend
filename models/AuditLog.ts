import mongoose, { type Model, type Types } from "mongoose";
import { defineModel } from "@/models/base";

/**
 * Audit log for every administrative mutation.
 *
 * Answers "who changed this price, and to what, and when" — the question that
 * arrives after a customer is charged the wrong amount, or when a staff member
 * leaves and you need to know what they touched.
 *
 * `before` and `after` hold the changed fields only, not whole documents.
 * Storing full snapshots of every product edit would dwarf the catalogue
 * itself, and the diff is what anyone actually reads.
 *
 * **Never log secrets here.** Password hashes, tokens and payment payloads are
 * stripped by the audit service before the entry is written; an audit log is a
 * long-lived, widely-read collection and is the worst place for a credential to
 * come to rest.
 */

export interface AuditLogDocument {
  _id: Types.ObjectId;
  actorId?: Types.ObjectId;
  actorEmail?: string;
  actorRole?: string;

  /** `product.update`, `order.cancel`, `user.role_change`. */
  action: string;
  entityType: string;
  entityId?: string;

  before?: Record<string, unknown>;
  after?: Record<string, unknown>;

  ip?: string;
  userAgent?: string;
  requestId?: string;

  createdAt: Date;
}

const auditLogSchema = new mongoose.Schema<AuditLogDocument>(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    actorEmail: { type: String, trim: true },
    actorRole: { type: String, trim: true },

    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, trim: true },

    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },

    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true, maxlength: 400 },
    requestId: { type: String, trim: true },
  },
  {
    // `createdAt` only. An audit entry that can be updated is not an audit
    // entry — the collection is append-only by design.
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

/** "What did this person do?" and "what happened to this record?" */
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export const AuditLogModel: Model<AuditLogDocument> = defineModel("AuditLog", auditLogSchema);
