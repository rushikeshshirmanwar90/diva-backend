import { ApiError } from "@/lib/api/errors";
import { RateLimitModel } from "@/models/RateLimit";

/**
 * Rate limiting backed by MongoDB.
 *
 * Deliberately **not** an in-memory Map. PM2 runs this app in cluster mode with
 * one process per core, and each process would keep its own counter — so a
 * "5 attempts per 15 minutes" login limit silently becomes 5 × core-count, and
 * a rolling restart resets it to zero. A shared store is the only correct
 * answer once there is more than one process, and Mongo is already here.
 *
 * Fixed-window counters, not sliding. A determined attacker can send 2× the
 * limit across a window boundary; for credential stuffing and OTP abuse that
 * margin is irrelevant next to the simplicity of one atomic upsert per check.
 *
 * The atomic `$inc` inside `findOneAndUpdate` matters: a read-then-write would
 * let concurrent requests each read the same count and all pass.
 */

export type RateLimitRule = {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  /**
   * Strictest tier. Keyed per account *and* per IP so neither an attacker
   * targeting one account nor one spraying many accounts gets a free pass.
   */
  login: { limit: 5, windowSeconds: 15 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  otpRequest: { limit: 3, windowSeconds: 15 * 60 },
  otpVerify: { limit: 10, windowSeconds: 15 * 60 },
  passwordReset: { limit: 3, windowSeconds: 60 * 60 },
  refresh: { limit: 60, windowSeconds: 15 * 60 },
  /** Signed uploads are cheap for us but cost Cloudinary quota. */
  upload: { limit: 60, windowSeconds: 60 * 60 },
  /** Public catalogue reads — generous; this only stops scraping floods. */
  publicRead: { limit: 300, windowSeconds: 60 },
  write: { limit: 60, windowSeconds: 60 },
  contact: { limit: 5, windowSeconds: 60 * 60 },
  /**
   * Review submission, per account.
   *
   * Ten an hour is far above honest use — a customer reviews the piece they
   * bought — and far below what makes a compromised account useful for posting
   * spam across the catalogue.
   */
  review: { limit: 10, windowSeconds: 60 * 60 },
  /**
   * Order creation. Tight, because each attempt reserves stock — an unlimited
   * loop here takes the whole catalogue out of circulation without paying for
   * any of it. Ten is well above what a genuine customer retrying a failed
   * payment ever needs.
   */
  checkout: { limit: 10, windowSeconds: 10 * 60 },
  /**
   * Payment status polling. The return page polls every couple of seconds
   * while a payment settles, and each poll costs a gateway round trip.
   */
  paymentStatus: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Consumes one unit of budget.
 *
 * `identifier` should be the narrowest thing that identifies the actor: an
 * account email for login, an IP for anonymous reads, a user id for authored
 * writes.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);

  const record = await RateLimitModel.findOneAndUpdate(
    { key: `${name}:${identifier}`, windowStart: new Date(windowStart) },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();

  const count = record?.count ?? 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds,
  };
}

/**
 * Consumes budget and throws a 429 when exhausted.
 *
 * The message deliberately does not distinguish "this account is rate limited"
 * from "this IP is rate limited" — the difference tells an attacker whether the
 * account they guessed exists.
 */
export async function enforceRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<void> {
  const result = await consumeRateLimit(name, identifier);

  if (!result.allowed) {
    throw ApiError.rateLimited(
      `Too many attempts. Please try again in ${formatWait(result.retryAfterSeconds)}.`,
    );
  }
}

/**
 * Enforces several keys at once, e.g. per-IP and per-account for login.
 *
 * All keys are consumed even if the first one fails, so an attacker cannot
 * avoid burning their IP budget by first tripping the account budget.
 */
export async function enforceRateLimits(
  checks: { name: RateLimitName; identifier: string }[],
): Promise<void> {
  const results = await Promise.all(
    checks.map((check) => consumeRateLimit(check.name, check.identifier)),
  );

  const blocked = results.find((result) => !result.allowed);

  if (blocked) {
    throw ApiError.rateLimited(
      `Too many attempts. Please try again in ${formatWait(blocked.retryAfterSeconds)}.`,
    );
  }
}

/**
 * Clears a counter after a legitimate success.
 *
 * Without this, five failed logins followed by a correct password still leaves
 * the user locked out for the rest of the window — punishing exactly the person
 * who proved they own the account.
 */
export async function resetRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<void> {
  await RateLimitModel.deleteMany({ key: `${name}:${identifier}` });
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}
