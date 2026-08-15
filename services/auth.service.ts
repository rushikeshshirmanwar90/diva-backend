import { ApiError } from "@/lib/api/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  signAccessToken,
  generateRefreshToken,
  generateFamilyId,
  hashRefreshToken,
  refreshTokenExpiry,
  generateOtp,
  hashOtp,
  generateResetToken,
  hashResetToken,
  safeEqual,
} from "@/lib/auth/tokens";
import { isStaffRole } from "@/lib/auth/rbac";
import * as users from "@/repositories/user.repository";
import * as refreshTokens from "@/repositories/refreshToken.repository";
import { enforceRateLimits, resetRateLimit } from "@/lib/api/rate-limit";
import { queueMail, sendMailNow } from "@/lib/send-mail";
import { otpEmail, welcomeEmail, passwordResetEmail } from "@/lib/send-mail";
import { env, googleAuthConfig } from "@/config/env";
import { OAuth2Client } from "google-auth-library";
import type { RegisterInput, LoginInput, GoogleLoginInput } from "@/validators/auth";
import type { Role } from "@/models/enums";

/**
 * Authentication business logic.
 *
 * The recurring theme in this file is **not leaking which accounts exist**.
 * Registration, login, password reset and OTP resend all take care to respond
 * identically whether or not the email is registered. An endpoint that says
 * "no account with that email" is an account-enumeration oracle, and for a
 * jewellery store the customer list itself has value to a competitor.
 */

const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TTL_MINUTES = 30;

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResult = {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    emailVerified: boolean;
    avatarUrl?: string;
  };
  tokens: SessionTokens;
};

type RequestContext = { ip: string; userAgent: string };

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function register(input: RegisterInput, context: RequestContext) {
  await enforceRateLimits([
    { name: "register", identifier: context.ip },
    { name: "register", identifier: input.email },
  ]);

  const existing = await users.findByEmail(input.email);

  if (existing) {
    /**
     * An unverified account is treated as "resend the code" rather than
     * "already registered".
     *
     * That covers the common real case — someone signed up, lost the email and
     * tried again — and it avoids confirming to a stranger that the address is
     * registered. A verified account gets the same generic response below.
     */
    if (!existing.emailVerifiedAt) {
      await issueOtp(String(existing._id), existing.name, existing.email);
      return { requiresVerification: true, email: existing.email };
    }

    // Deliberately vague, and deliberately identical in shape to success.
    throw ApiError.conflict(
      "That email cannot be used to register. Try signing in, or reset your password.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await users.create({
    name: input.name,
    email: input.email,
    passwordHash,
    phone: input.phone,
    role: "customer",
    marketingOptIn: input.marketingOptIn,
  });

  await issueOtp(String(user._id), user.name, user.email);

  return { requiresVerification: true, email: user.email };
}

/**
 * Generates, stores and sends a verification OTP.
 *
 * Sent with `sendMailNow` rather than queued: the user is staring at a "check
 * your email" screen, so this is the one case where blocking on SMTP is right.
 * A failure here must surface, because a silently-unsent OTP leaves the account
 * permanently unverifiable from the user's point of view.
 */
async function issueOtp(userId: string, name: string, email: string) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await users.setOtp(userId, hashOtp(otp), expiresAt);

  try {
    await sendMailNow({ to: email, ...otpEmail(name, otp) });
  } catch (error) {
    console.error("[auth] failed to send OTP:", error);
    throw ApiError.serviceUnavailable(
      "We could not send your verification email. Please try again shortly.",
    );
  }
}

export async function resendOtp(email: string, context: RequestContext) {
  await enforceRateLimits([
    { name: "otpRequest", identifier: context.ip },
    { name: "otpRequest", identifier: email },
  ]);

  const user = await users.findByEmail(email);

  // Silent success for unknown or already-verified accounts — the response must
  // not reveal which case applies.
  if (user && !user.emailVerifiedAt) {
    await issueOtp(String(user._id), user.name, user.email);
  }

  return { sent: true };
}

export async function verifyOtp(
  input: { email: string; otp: string },
  context: RequestContext,
): Promise<AuthResult> {
  await enforceRateLimits([
    { name: "otpVerify", identifier: context.ip },
    { name: "otpVerify", identifier: input.email },
  ]);

  const user = await users.findByEmailWithSecrets(input.email);

  if (!user || !user.otpHash || !user.otpExpiresAt) {
    throw ApiError.badRequest("That verification code is invalid or has expired.");
  }

  if (user.otpExpiresAt < new Date()) {
    throw ApiError.badRequest("That verification code has expired. Request a new one.");
  }

  /**
   * Attempt cap on the OTP itself.
   *
   * A 6-digit code is only a million possibilities, which a script exhausts in
   * minutes. The per-IP rate limit alone is insufficient because an attacker can
   * rotate addresses; the counter lives on the account so it follows the target.
   */
  if ((user.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    throw ApiError.rateLimited("Too many incorrect codes. Request a new one.");
  }

  if (!safeEqual(hashOtp(input.otp), user.otpHash)) {
    await users.incrementOtpAttempts(String(user._id));
    throw ApiError.badRequest("That verification code is incorrect.");
  }

  await users.markEmailVerified(String(user._id));
  await resetRateLimit("otpVerify", input.email);

  queueMail({ to: user.email, ...welcomeEmail(user.name) });

  return issueSession(
    {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      avatarUrl: user.avatarUrl,
      emailVerifiedAt: new Date(),
    },
    context,
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * `email` is required here even though `LoginInput` allows it to be absent.
 *
 * The admin console omits it and the controller fills it in from configuration
 * before calling this. Stating that in the type keeps the resolution in one
 * place: this function must never have to guess which account it is checking a
 * password against, and the per-account rate limit below needs a real
 * identifier to count.
 */
export async function login(
  input: LoginInput & { email: string },
  context: RequestContext,
): Promise<AuthResult> {
  /**
   * Limited per IP **and** per account.
   *
   * Per-account alone lets one attacker spray a common password across
   * thousands of accounts, never tripping any single account's counter.
   * Per-IP alone lets a distributed attacker grind one account. Both are needed.
   */
  await enforceRateLimits([
    { name: "login", identifier: context.ip },
    { name: "login", identifier: input.email },
  ]);

  const user = await users.findByEmailWithSecrets(input.email);

  // `verifyPassword` runs a dummy bcrypt comparison when there is no hash, so
  // an unknown email takes the same time as a wrong password.
  const passwordValid = await verifyPassword(input.password, user?.passwordHash);

  if (!user || !passwordValid) {
    throw ApiError.unauthenticated("Incorrect email or password.");
  }

  if (!user.isActive || user.deletedAt) {
    throw ApiError.forbidden("This account has been suspended. Contact support.");
  }

  if (!user.emailVerifiedAt) {
    throw new ApiError(403, "FORBIDDEN", "Verify your email address before signing in.", {
      details: [{ path: "email", message: "EMAIL_NOT_VERIFIED" }],
    });
  }

  /**
   * Staff check before any session is minted.
   *
   * A customer's correct credentials must never produce an admin cookie, even
   * momentarily — the admin cookie is scoped differently and is trusted by
   * `requireStaff`.
   */
  if (input.audience === "admin" && !isStaffRole(user.role)) {
    throw ApiError.forbidden("This account does not have admin access.");
  }

  await resetRateLimit("login", input.email);
  await users.recordLogin(String(user._id));

  return issueSession(user, context);
}

/**
 * One client per process, not per request — `OAuth2Client` has no per-call
 * state and building it fresh on every sign-in would be pure overhead.
 * `googleAuthConfig()` is re-checked per call anyway, so a config change still
 * takes effect without a restart from the caller's point of view.
 */
let googleClient: OAuth2Client | null = null;

function getGoogleClient(clientId: string): OAuth2Client {
  googleClient ??= new OAuth2Client(clientId);
  return googleClient;
}

/**
 * Signs in (or silently registers) with a Google ID token.
 *
 * The token is the one thing here that must not be trusted at face value —
 * it arrives from the browser, and a browser lies. `verifyIdToken` checks the
 * signature against Google's published keys and that `aud` names *this* app,
 * which is what turns "a JWT that looks right" into "Google issued this for
 * us, moments ago, to the account named inside it."
 *
 * Matching an existing account happens in two steps and deliberately in this
 * order:
 *   1. By `googleId` — the account has signed in with Google before.
 *   2. By `email` — the account registered with a password and is now using
 *      Google for the first time. The Google identity is linked rather than
 *      creating a second account, because Google only hands back a verified
 *      email for accounts with `email_verified`, which is exactly the bar
 *      password registration already clears with its own OTP.
 * Neither matches: a brand-new account, pre-verified, since Google already
 * vouched for the email.
 */
export async function loginWithGoogle(
  input: GoogleLoginInput,
  context: RequestContext,
): Promise<AuthResult> {
  const config = googleAuthConfig();

  if (!config) {
    throw ApiError.serviceUnavailable("Google sign-in is not configured.");
  }

  await enforceRateLimits([{ name: "login", identifier: context.ip }]);

  let payload;

  try {
    const ticket = await getGoogleClient(config.clientId).verifyIdToken({
      idToken: input.idToken,
      audience: config.clientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthenticated("Your Google sign-in could not be verified.");
  }

  if (!payload?.sub || !payload.email) {
    throw ApiError.unauthenticated("Your Google sign-in could not be verified.");
  }

  if (!payload.email_verified) {
    throw ApiError.forbidden("Your Google account's email address is not verified.");
  }

  let user = await users.findByGoogleId(payload.sub);

  if (!user) {
    const existing = await users.findByEmail(payload.email);

    user = existing
      ? await users.linkGoogleId(String(existing._id), payload.sub)
      : await users.create({
          name: payload.name ?? payload.email.split("@")[0]!,
          email: payload.email,
          googleId: payload.sub,
          avatarUrl: payload.picture,
          role: "customer",
          emailVerifiedAt: new Date(),
        });
  }

  if (!user) {
    // `linkGoogleId` returns null only if the account was deleted between the
    // lookup above and the update — vanishingly rare, but a 401 is correct.
    throw ApiError.unauthenticated("Your Google sign-in could not be verified.");
  }

  if (!user.isActive || user.deletedAt) {
    throw ApiError.forbidden("This account has been suspended. Contact support.");
  }

  if (input.audience === "admin" && !isStaffRole(user.role)) {
    throw ApiError.forbidden("This account does not have admin access.");
  }

  await users.recordLogin(String(user._id));

  return issueSession(user, context);
}

// ---------------------------------------------------------------------------
// Session issuance and refresh
// ---------------------------------------------------------------------------

async function issueSession(
  user: {
    _id: unknown;
    name: string;
    email: string;
    role: Role;
    tokenVersion: number;
    avatarUrl?: string;
    emailVerifiedAt?: Date | null;
  },
  context: RequestContext,
  familyId = generateFamilyId(),
): Promise<AuthResult> {
  const userId = String(user._id);

  const accessToken = await signAccessToken({
    sub: userId,
    role: user.role,
    tokenVersion: user.tokenVersion,
    email: user.email,
  });

  const { token: refreshToken, tokenHash } = generateRefreshToken();

  await refreshTokens.issue({
    userId,
    tokenHash,
    familyId,
    expiresAt: refreshTokenExpiry(),
    userAgent: context.userAgent,
    ip: context.ip,
  });

  return {
    user: {
      id: userId,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: Boolean(user.emailVerifiedAt),
      avatarUrl: user.avatarUrl,
    },
    tokens: { accessToken, refreshToken },
  };
}

/**
 * Rotates a refresh token, with reuse detection.
 *
 * The security-critical path in this file. `redeem` atomically marks the token
 * used and returns it only if it was previously unused, so:
 *
 *  - It returns a token → normal rotation. Issue a new pair in the same family.
 *  - It returns null and the token exists → **it was already redeemed.** Two
 *    parties hold the same token, which means one of them stole it. Revoke the
 *    entire family, forcing everyone back to the password. Only the legitimate
 *    owner can come back.
 *  - It returns null and the token does not exist → an expired or bogus token.
 *    Just a 401.
 */
export async function refresh(
  refreshToken: string,
  context: RequestContext,
): Promise<AuthResult> {
  await enforceRateLimits([{ name: "refresh", identifier: context.ip }]);

  const tokenHash = hashRefreshToken(refreshToken);
  const redeemed = await refreshTokens.redeem(tokenHash);

  if (!redeemed) {
    const existing = await refreshTokens.findAnyByHash(tokenHash);

    if (existing?.usedAt) {
      await refreshTokens.revokeFamily(existing.familyId, "REUSE_DETECTED");
      // Also invalidates every outstanding *access* token for the account, so
      // the thief's stolen 15-minute window closes immediately too.
      await users.bumpTokenVersion(String(existing.userId));

      console.warn(
        `[auth] refresh token reuse detected for user ${String(existing.userId)} — family revoked`,
      );

      throw ApiError.unauthenticated(
        "Your session was ended for security reasons. Please sign in again.",
      );
    }

    throw ApiError.unauthenticated("Your session has expired. Please sign in again.");
  }

  const user = await users.findById(String(redeemed.userId));

  if (!user || !user.isActive || user.deletedAt) {
    await refreshTokens.revokeFamily(redeemed.familyId, "ADMIN");
    throw ApiError.unauthenticated("This account is no longer active.");
  }

  // Same family: the chain of rotations from one login stays linked, which is
  // what makes family-wide revocation meaningful.
  return issueSession(user, context, redeemed.familyId);
}

export async function logout(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;

  const existing = await refreshTokens.findAnyByHash(hashRefreshToken(refreshToken));
  if (existing) {
    await refreshTokens.revokeFamily(existing.familyId, "LOGOUT");
  }
}

/** Ends every session on every device. */
export async function logoutEverywhere(userId: string): Promise<void> {
  await refreshTokens.revokeAllForUser(userId, "LOGOUT");
  await users.bumpTokenVersion(userId);
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function forgotPassword(email: string, context: RequestContext) {
  await enforceRateLimits([
    { name: "passwordReset", identifier: context.ip },
    { name: "passwordReset", identifier: email },
  ]);

  const user = await users.findByEmail(email);

  if (user && user.isActive && !user.deletedAt) {
    const { token, tokenHash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    await users.setResetToken(String(user._id), tokenHash, expiresAt);

    const resetUrl = `${env.STOREFRONT_URL}/reset-password?token=${token}`;
    queueMail({ to: user.email, ...passwordResetEmail(user.name, resetUrl) });
  }

  // Identical response either way. "No account with that email" here would turn
  // this endpoint into a free customer-list checker.
  return { sent: true };
}

export async function resetPassword(input: { token: string; password: string }) {
  const user = await users.findByResetToken(hashResetToken(input.token));

  if (!user) {
    throw ApiError.badRequest("This reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(input.password);

  // `setPassword` also increments tokenVersion, and revoking the refresh tokens
  // completes it: whoever prompted the reset is signed out everywhere.
  await users.setPassword(String(user._id), passwordHash);
  await refreshTokens.revokeAllForUser(String(user._id), "PASSWORD_CHANGED");

  return { reset: true };
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await users.findByIdWithSecrets(userId);

  if (!user) throw ApiError.notFound("Account not found");

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw ApiError.unauthenticated("Your current password is incorrect.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await users.setPassword(userId, passwordHash);
  await refreshTokens.revokeAllForUser(userId, "PASSWORD_CHANGED");

  return { changed: true };
}

export async function getProfile(userId: string) {
  const user = await users.findById(userId);
  if (!user) throw ApiError.notFound("Account not found");

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatarUrl: user.avatarUrl,
    emailVerified: Boolean(user.emailVerifiedAt),
    marketingOptIn: user.marketingOptIn,
    createdAt: user.createdAt,
  };
}

export async function updateProfile(
  userId: string,
  input: { name?: string; phone?: string; avatarUrl?: string; marketingOptIn?: boolean },
) {
  const updated = await users.updateById(userId, input);
  if (!updated) throw ApiError.notFound("Account not found");

  return getProfile(userId);
}
