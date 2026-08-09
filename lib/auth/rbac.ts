import { ApiError } from "@/lib/api/errors";
import type { Role } from "@/models/enums";

/**
 * Role-based access control.
 *
 * Permissions are named capabilities, not roles, and code checks capabilities.
 * The difference matters when the business changes: adding a "merchandiser"
 * role who can edit collections but not products is a one-line change to the
 * matrix below, whereas code that asks `if (role === 'catalog')` in forty
 * places requires forty edits and will miss some.
 *
 * **Enforced at the service layer, never only in the UI.** Hiding a button is
 * presentation, not authorisation — the endpoint behind it is still reachable
 * with curl. Every mutation calls `assertCan` before it does anything.
 */

export const PERMISSIONS = [
  "catalog:read",
  "catalog:write",
  "order:read",
  "order:write",
  "order:cancel",
  "payment:read",
  "payment:refund",
  "shipment:read",
  "shipment:write",
  "customer:read",
  "customer:write",
  "coupon:read",
  "coupon:write",
  "review:moderate",
  "content:write",
  "support:read",
  "support:write",
  "settings:write",
  "rate:write",
  "analytics:read",
  "audit:read",
  /** Assigning roles. Deliberately superadmin-only. */
  "role:assign",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  /** Customers hold no admin permission at all; their own data is scoped by ownership. */
  customer: [],

  support: ["order:read", "customer:read", "support:read", "support:write", "shipment:read"],

  catalog: ["catalog:read", "catalog:write", "content:write", "review:moderate", "rate:write"],

  finance: [
    "order:read",
    "payment:read",
    "payment:refund",
    "analytics:read",
    "coupon:read",
    "coupon:write",
  ],

  /** Everything operational. Notably **not** `role:assign`. */
  admin: [
    "catalog:read",
    "catalog:write",
    "order:read",
    "order:write",
    "order:cancel",
    "payment:read",
    "payment:refund",
    "shipment:read",
    "shipment:write",
    "customer:read",
    "customer:write",
    "coupon:read",
    "coupon:write",
    "review:moderate",
    "content:write",
    "support:read",
    "support:write",
    "settings:write",
    "rate:write",
    "analytics:read",
    "audit:read",
  ],

  superadmin: [...PERMISSIONS],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

/**
 * Throws 403 unless the role holds the permission.
 *
 * The message names the missing permission. That is safe — the caller is
 * already authenticated, and telling a support agent "you need catalog:write"
 * produces a useful bug report instead of a shrug.
 */
export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw ApiError.forbidden(`This action requires the "${permission}" permission.`);
  }
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * Whether a role may sign in to the admin UI at all.
 *
 * Checked at login, before any session is issued, so a customer's credentials
 * cannot produce an admin cookie even briefly.
 */
export function isStaffRole(role: Role): boolean {
  return role !== "customer";
}

/**
 * Guards role assignment.
 *
 * Two rules, both learned the hard way: nobody may grant a role above their
 * own, and only a superadmin may create another superadmin. Without the first,
 * an `admin` promotes themselves to `superadmin` and privilege separation was
 * decorative.
 */
export function assertCanAssignRole(actorRole: Role, targetRole: Role): void {
  assertCan(actorRole, "role:assign");

  if (targetRole === "superadmin" && actorRole !== "superadmin") {
    throw ApiError.forbidden("Only a superadmin can grant the superadmin role.");
  }
}
