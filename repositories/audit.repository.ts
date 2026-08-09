import { AuditLogModel } from "@/models/AuditLog";
import type { QueryFilter } from "mongoose";
import type { AuditLogDocument } from "@/models/AuditLog";

export async function write(entry: {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}) {
  await AuditLogModel.create(entry);
}

export async function list(options: {
  page: number;
  limit: number;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
}) {
  const filter: QueryFilter<AuditLogDocument> = {};

  if (options.actorId) filter.actorId = options.actorId;
  if (options.entityType) filter.entityType = options.entityType;
  if (options.entityId) filter.entityId = options.entityId;
  if (options.action) filter.action = options.action;

  const [items, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);

  return { items, total };
}
