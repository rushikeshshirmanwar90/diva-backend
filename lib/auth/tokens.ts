import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { ApiError, ErrorCode } from "@/lib/api/errors";
import type { Role } from "@/models/enums";

/**
 * Token issuing and verification.
 *
 * Two different mechanisms, on purpose:
 *
 * - **Access token** — a short-lived (15 min) signed JWT. Stateless, so
 *   verifying it costs no database round-trip, which is what makes it viable on
 *   every request. The cost of statelessness is that it cannot be revoked
 *   individually; `tokenVersion` is the answer to that (see below).
 *
 * - **Refresh token** — an opaque 256-bit random string, stored hashed. Not a
 *   JWT, because it needs to be revocable and there is nothing to gain from
 *   making it self-describing. It is presented rarely, so a database lookup per
 *   use is fine.
 *
 * `tokenVersion` is carried in the access token and compared against the user
 * document on each authenticated request. Bumping it on the user invalidates
 * every outstanding access token for that account at once — the mechanism
 * behind "log out everywhere", a forced password reset, and an account ban.
 */

const secretKey = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = "diva-api";
const AUDIENCE = "diva-clients";

export type AccessTokenClaims = {
  sub: string;
  role: Role;
  tokenVersion: number;
  email: string;
};

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({
    role: claims.role,
    tokenVersion: claims.tokenVersion,
    email: claims.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(secretKey);
}

/**
 * Verifies an access token.
 *
 * `issuer` and `audience` are checked, not just the signature. Without them, a
 * token signed with the same secret for a different purpose — a password-reset
 * link, say — would be accepted as a session.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });

    return assertClaims(payload);
  } catch (error) {
    if (error instanceof ApiError) throw error;

    const expired =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "ERR_JWT_EXPIRED";

    // Distinguished from a malformed token so clients know to refresh rather
    // than to send the user back to the login screen.
    throw expired
      ? new ApiError(401, ErrorCode.TOKEN_EXPIRED, "Session expired")
      : ApiError.unauthenticated("Invalid session token");
  }
}

function assertClaims(payload: JWTPayload): AccessTokenClaims {
  const { sub, role, tokenVersion, email } = payload as JWTPayload & Partial<AccessTokenClaims>;

  if (!sub || typeof role !== "string" || typeof tokenVersion !== "number" || !email) {
    throw ApiError.unauthenticated("Malformed session token");
  }

  return { sub, role: role as Role, tokenVersion, email };
}

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

/**
 * A new refresh token: the value to hand out, and the digest to store.
 *
 * 256 bits from a CSPRNG. Because the value is unguessable by construction, a
 * plain SHA-256 is the correct storage hash — bcrypt exists to slow down
 * guessing of low-entropy secrets and would only add latency here.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Groups every token descended from one login, for reuse-detection revocation. */
export function generateFamilyId(): string {
  return randomBytes(16).toString("hex");
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// One-time secrets
// ---------------------------------------------------------------------------

/** Six-digit email OTP. `randomInt` is uniform; `Math.random()` is neither uniform enough nor a CSPRNG. */
export function generateOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

/** Password-reset token: goes in an emailed link, stored hashed. */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

/**
 * Its own function even though it is the same SHA-256 as
 * `hashRefreshToken`. Reusing the refresh helper here would work today and
 * break silently the moment either token type changes its hashing — and a
 * password-reset lookup that quietly stops matching is a support nightmare.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison for secrets.
 *
 * `a === b` on strings short-circuits at the first differing byte, so how long
 * it takes leaks how much of the guess was correct. Irrelevant for a 6-digit
 * OTP in practice, but this is the kind of thing that should never be the
 * interesting part of an incident.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}
