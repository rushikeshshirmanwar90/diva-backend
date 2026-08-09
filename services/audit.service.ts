import { after } from "next/server";
import * as auditRepository from "@/repositories/audit.repository";
import type { Principal } from "@/lib/auth/session";

/**
 * Audit logging for administrative mutations.
 *
 * Two properties this layer guarantees:
 *
 * 1. **Secrets never reach the log.** `redact` strips anything whose key looks
 *    like a credential before the entry is written. An audit log is long-lived
 *    and widely readable — the worst possible resting place for a password hash
 *    or a payment payload.
 *
 * 2. **Logging cannot fail the operation it describes.** The write happens via
 *    `after`, so a slow or failing audit insert never turns a successful product
 *    update into a 500. The trade-off is accepted deliberately: losing an audit
 *    row is bad, but rolling back a completed business action because the
 *    logging failed is worse.
 */

const SENSITIVE_KEY = /pass(word)?|secret|token|hash|otp|salt|authorization|cookie|apikey|api_key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1);
    }

    return output;
  }

  return value;
}

/**
 * Reduces two states to just the fields that changed.
 *
 * Storing whole document snapshots on every product edit would make this
 * collection larger than the catalogue it describes, and the diff is what
 * anyone actually reads.
 */
function diff(
  before: Record<string, unknown> | undefined,
  after_: Record<string, unknown> | undefined,
): { before?: Record<string, unknown>; after?: Record<string, unknown> } {
  if (!before || !after_) {
    return {
      before: before ? (redact(before) as Record<string, unknown>) : undefined,
      after: after_ ? (redact(after_) as Record<string, unknown>) : undefined,
    };
  }

  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after_)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after_[key])) {
      changedBefore[key] = before[key];
      changedAfter[key] = after_[key];
    }
  }

  return {
    before: redact(changedBefore) as Record<string, unknown>,
    after: redact(changedAfter) as Record<string, unknown>,
  };
}

export type AuditContext = {
  principal: Principal;
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

export function record(
  context: AuditContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  },
): void {
  const changes = diff(entry.before, entry.after);

  after(async () => {
    try {
      await auditRepository.write({
        actorId: context.principal.userId,
        actorEmail: context.principal.email,
        actorRole: context.principal.role,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: changes.before,
        after: changes.after,
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });
    } catch (error) {
      console.error(`[audit] failed to record ${entry.action}:`, error);
    }
  });
}

export const listAuditLogs = auditRepository.list;
