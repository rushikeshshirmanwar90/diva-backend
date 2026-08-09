import { ApiError } from "@/lib/api/errors";
import * as users from "@/repositories/user.repository";
import type { Role } from "@/models/enums";

/**
 * Customer administration.
 *
 * Every function here shapes the response explicitly rather than returning the
 * document. That is deliberate: the user document carries `passwordHash`,
 * `otpHash`, `passwordResetTokenHash` and `tokenVersion`, and although those
 * are `select: false`, an explicit allow-list means a future schema addition
 * cannot leak into an admin response by default. Opt-in beats opt-out for
 * anything adjacent to credentials.
 */

export type CustomerSummary = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  emailVerified: boolean;
  isActive: boolean;
  marketingOptIn: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
};

function toSummary(user: {
  _id: unknown;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  emailVerifiedAt?: Date;
  isActive: boolean;
  marketingOptIn: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}): CustomerSummary {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    isActive: user.isActive,
    marketingOptIn: user.marketingOptIn,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function listCustomers(options: {
  page: number;
  limit: number;
  role?: Role;
  search?: string;
}) {
  const result = await users.list(options);

  return {
    items: result.items.map(toSummary),
    total: result.total,
  };
}

export async function getCustomer(id: string): Promise<CustomerSummary> {
  const user = await users.findById(id);
  if (!user) throw ApiError.notFound("We could not find that customer.");

  return toSummary(user);
}

/**
 * Suspends or restores an account.
 *
 * Suspension bumps `tokenVersion` via the repository, which invalidates every
 * outstanding access token immediately. Without that, a banned account keeps
 * working for up to fifteen minutes — the exact window in which someone you
 * just blocked for fraud places another order.
 */
export async function setCustomerActive(id: string, isActive: boolean) {
  const user = await users.findById(id);
  if (!user) throw ApiError.notFound("We could not find that customer.");

  if (user.role !== "customer") {
    throw ApiError.forbidden(
      "Staff accounts are managed from the team settings, not the customer list.",
    );
  }

  if (isActive) {
    await users.updateById(id, { isActive: true });
  } else {
    // `softDelete` clears isActive and bumps tokenVersion in one write.
    await users.softDelete(id);
    await users.updateById(id, { deletedAt: null });
  }

  return getCustomer(id);
}
