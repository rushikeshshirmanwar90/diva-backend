import { z } from "zod";
import { email, phone } from "@/validators/common";
import { validatePasswordStrength } from "@/lib/auth/password";

/**
 * Auth request schemas.
 *
 * Note what `registerSchema` does **not** accept: `role`, `emailVerifiedAt`,
 * `tokenVersion`, `isActive`. Because the schema is `.strict()`, a request
 * carrying any of them is rejected outright rather than having them stripped —
 * a stripped field is a silent near-miss, a rejected one is a bug report.
 */

const password = z
  .string()
  .min(1, "Password is required")
  .superRefine((value, ctx) => {
    const problem = validatePasswordStrength(value);
    if (problem) {
      ctx.addIssue({ code: "custom", message: problem });
    }
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(80),
    email,
    password,
    phone: phone.optional(),
    marketingOptIn: z.boolean().default(false),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    /**
     * Optional for the admin console only, which asks for a password alone and
     * lets the server supply the address from `ADMIN_LOGIN_EMAIL`. A storefront
     * login has many possible accounts and still must name one — the refine
     * below enforces that.
     */
    email: email.optional(),
    // Deliberately not `password` — strength rules must never apply at login.
    // Enforcing them here would lock out every user whose existing password
    // predates the current policy.
    password: z.string().min(1, "Password is required").max(128),
    /**
     * Which surface the login is for. Determines the cookie name, scope and
     * SameSite policy, and whether staff-only checks apply.
     */
    audience: z.enum(["storefront", "admin"]).default("storefront"),
  })
  .strict()
  .refine((value) => value.audience === "admin" || value.email != null, {
    message: "Email is required",
    path: ["email"],
  });

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * The credential Google Identity Services hands the browser is a signed JWT
 * (an "ID token"), not a password — this schema only checks it is shaped like
 * one. Whether it is genuinely Google's, and whose account it names, is
 * verified server-side against Google's public keys; nothing about that trust
 * decision happens here.
 */
export const googleLoginSchema = z
  .object({
    idToken: z.string().min(20, "Invalid Google credential"),
    audience: z.enum(["storefront", "admin"]).default("storefront"),
  })
  .strict();

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export const verifyOtpSchema = z
  .object({
    email,
    otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  })
  .strict();

export const resendOtpSchema = z.object({ email }).strict();

export const forgotPasswordSchema = z.object({ email }).strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, "Invalid reset link"),
    password,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict();

/**
 * Refresh. The token is optional in the body because the web clients send it as
 * an httpOnly cookie the JS cannot read; mobile sends it explicitly.
 */
export const refreshSchema = z
  .object({
    refreshToken: z.string().min(20).optional(),
    audience: z.enum(["storefront", "admin"]).default("storefront"),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: phone.optional(),
    avatarUrl: z.url().optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();
