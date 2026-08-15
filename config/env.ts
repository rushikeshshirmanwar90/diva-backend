import { z } from "zod";

/**
 * Environment contract for the backend.
 *
 * Parsed once, at module load. A missing or malformed variable throws here and
 * the process never finishes booting — which is deliberate. A server that
 * starts without a database URL and only fails on the first customer request is
 * strictly worse than one that refuses to start at all.
 *
 * Variable names follow the `.env` file that already exists in this project
 * (`DB_URL`, `JWT_SECRET`, `SMTP_PASS`, …) rather than inventing new ones — a
 * config file and its schema disagreeing is a boot failure nobody enjoys
 * debugging.
 *
 * Integrations that are not wired up yet (Cloudinary, PhonePe, Shiprocket) are
 * optional here so local development is not blocked. The modules that consume
 * them assert presence at point of use, via `cloudinaryConfig()` and friends,
 * so a missing key surfaces as a clear 503 on one endpoint rather than a crash
 * on boot.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Public origin of this backend. Used to build absolute callback URLs. */
  APP_URL: z.url().default("http://localhost:4000"),

  /** Public origin of the customer storefront (`diva-frontend`). */
  STOREFRONT_URL: z.url().default("http://localhost:3000"),

  /**
   * Origins permitted to send credentialed cross-origin requests.
   * Comma-separated. Never `*` — see lib/http/cors.ts for why that silently
   * breaks the moment credentials are involved.
   */
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:4000,http://localhost:8081")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // --- Database -----------------------------------------------------------
  DB_URL: z
    .string()
    .min(1, "DB_URL is required")
    .refine(
      (uri) => uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://"),
      "DB_URL must start with mongodb:// or mongodb+srv://",
    ),
  DB_NAME: z.string().min(1).default("diva"),

  // --- Auth ---------------------------------------------------------------
  /**
   * Signs access-token JWTs (HS256).
   *
   * 32 characters minimum: HS256 with a short secret is brute-forceable
   * offline once an attacker holds any single valid token. Generate one with
   * `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   *
   * There is deliberately no refresh-token secret. Refresh tokens are opaque
   * 256-bit random strings stored as SHA-256 digests, not JWTs — nothing needs
   * signing, so there is no second key to leak.
   */
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  /**
   * How long a session survives — **48 hours**.
   *
   * This, not `ACCESS_TOKEN_TTL`, is the number that decides when somebody has
   * to type their password again. Access tokens lapse every 15 minutes and the
   * admin console refreshes them silently; nobody sees that happen.
   *
   * The window slides: each refresh re-issues the token with a fresh 48 hours,
   * so an admin who works most days is never signed out, while one who walks
   * away for a long weekend is. Shortening this is the lever for tightening
   * security — it caps how long a stolen refresh cookie stays useful.
   */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(2),

  /**
   * Cookie `Domain` for web sessions, e.g. `.diva.com` so `www.diva.com` can
   * send cookies to `api.diva.com`. Leave unset in development — a host-only
   * cookie is correct for `localhost`, and setting a Domain there breaks it.
   */
  COOKIE_DOMAIN: z.string().optional(),

  /**
   * OAuth 2.0 client id from Google Cloud Console → Credentials.
   *
   * Not a secret — it is also embedded in the storefront bundle as
   * `NEXT_PUBLIC_GOOGLE_CLIENT_ID` so Google Identity Services can run in the
   * browser. It is used here only as the expected `aud` claim when verifying
   * an ID token, which is what actually proves the token was issued for this
   * app. Unset, `googleAuthConfig()` returns null and `/auth/google` answers
   * 503 rather than accepting tokens it cannot correctly verify.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),

  // --- Cloudinary ---------------------------------------------------------
  /**
   * The admin UI uploads **unsigned**, using a preset, so these two are the
   * only values it needs — and both are public by nature, hence the
   * `NEXT_PUBLIC_` prefix that puts them in the browser bundle.
   *
   * Understand what that means before treating it as ordinary config: an
   * unsigned preset is a write credential anyone can read out of the JS. It
   * cannot be scoped by us, and the folder / size / format rules below become
   * advisory — enforced only by our own code, which an attacker simply does not
   * run. Whatever limits actually bind must be set on the preset itself in the
   * Cloudinary dashboard.
   */
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: z.string().optional(),

  /**
   * Server-side credentials, for signed uploads and asset management.
   *
   * Unused while the admin uploads unsigned — kept because `lib/cloudinary/*`
   * still implements the signed path, and filling these in plus pointing the
   * admin back at `/uploads/signature` is the whole of the migration back.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  /** Folder prefix so Diva assets stay separable inside a shared account. */
  CLOUDINARY_FOLDER: z.string().default("diva"),

  // --- Mail ---------------------------------------------------------------
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  SMTP_ALLOW_INSECURE_TLS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  MAIL_FROM: z.string().optional(),

  // --- Payments: PhonePe Standard Checkout v2 -----------------------------
  /**
   * Standard Checkout v2 authenticates with OAuth, not the legacy `X-VERIFY`
   * checksum. `PHONEPE_MERCHANT_ID` and `PHONEPE_SALT_KEY` below belong to the
   * old flow and are kept only so an existing `.env` still parses — nothing
   * reads them. Delete them once the migration is confirmed complete.
   */
  PHONEPE_CLIENT_ID: z.string().optional(),
  PHONEPE_CLIENT_SECRET: z.string().optional(),
  /**
   * Credential generation number from the dashboard, not an API version.
   * It is `1` for every merchant until PhonePe asks you to rotate, at which
   * point it increments and the old secret stops working.
   */
  PHONEPE_CLIENT_VERSION: z.coerce.number().int().positive().default(1),

  /**
   * Basic-auth pair configured on the PhonePe dashboard's webhook screen.
   *
   * PhonePe signs callbacks as `SHA256(username:password)` in the
   * `Authorization` header. Without both of these, `/payments/phonepe/webhook`
   * refuses every delivery — which is the correct failure. An unauthenticated
   * webhook that flips orders to paid is a way to obtain jewellery for free.
   */
  PHONEPE_WEBHOOK_USERNAME: z.string().optional(),
  PHONEPE_WEBHOOK_PASSWORD: z.string().optional(),

  PHONEPE_ENV: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),

  /** Legacy v1 credentials. Unused — see the note above. */
  PHONEPE_MERCHANT_ID: z.string().optional(),
  PHONEPE_SALT_KEY: z.string().optional(),
  SALT_ID: z.string().optional(),

  // --- Shipping: Shiprocket ----------------------------------------------
  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  /**
   * The channel a Shiprocket order is filed under. Optional: omitted, orders
   * land in the default "Custom" channel, which is fine for a single storefront
   * but makes web and mobile sales indistinguishable in their reports.
   */
  SHIPROCKET_CHANNEL_ID: z.string().optional(),
  /**
   * Must match a pickup nickname registered in Shiprocket exactly, including
   * case. A mismatch is rejected at order creation with a message that does not
   * name the field, so it is worth checking first.
   */
  SHIPROCKET_PICKUP_LOCATION: z.string().default("Primary"),
  /** Shared secret echoed by Shiprocket as `x-api-key` on tracking webhooks. */
  SHIPROCKET_WEBHOOK_TOKEN: z.string().optional(),
  /** Fallback parcel dimensions (cm) and weight (kg) for a single jewellery box. */
  SHIPROCKET_DEFAULT_LENGTH_CM: z.coerce.number().positive().default(15),
  SHIPROCKET_DEFAULT_BREADTH_CM: z.coerce.number().positive().default(12),
  SHIPROCKET_DEFAULT_HEIGHT_CM: z.coerce.number().positive().default(8),
  SHIPROCKET_DEFAULT_WEIGHT_KG: z.coerce.number().positive().default(0.3),
  /** Origin pincode, for serviceability checks before an order exists. */
  SHIPROCKET_PICKUP_PINCODE: z.string().optional(),

  // --- Seeding ------------------------------------------------------------
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),

  /**
   * The account the admin console signs in as when only a password is typed.
   *
   * The console's form asks for a password alone, so the address has to come
   * from somewhere — and it comes from here rather than from the browser, which
   * keeps it out of the client bundle. Defaults to `SEED_ADMIN_EMAIL`, since
   * that is the account the seed script creates.
   *
   * Everything downstream is unchanged: the password is still verified against
   * that user's hash, and the session, role and audit trail are still that
   * user's. This only removes a field from a form.
   */
  ADMIN_LOGIN_EMAIL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the missing values.`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";

/**
 * Narrows the optional Cloudinary block to a fully-configured shape.
 *
 * Callers get a typed object or `null`, instead of the SDK's generic
 * "Must supply api_key" thrown from somewhere three frames deep.
 */
export function cloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return null;
  }

  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
    folder: env.CLOUDINARY_FOLDER,
  };
}

/**
 * PhonePe credentials, or `null` when the integration is not provisioned.
 *
 * Half-configured is treated as absent on purpose. A merchant with a client id
 * but no secret gets a clear 503 from the one endpoint that needs it, rather
 * than an opaque `401` from PhonePe's token service three calls later.
 */
export function phonePeConfig() {
  const { PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET } = env;

  if (!PHONEPE_CLIENT_ID || !PHONEPE_CLIENT_SECRET) return null;

  return {
    clientId: PHONEPE_CLIENT_ID,
    clientSecret: PHONEPE_CLIENT_SECRET,
    clientVersion: env.PHONEPE_CLIENT_VERSION,
    environment: env.PHONEPE_ENV,
    webhookUsername: env.PHONEPE_WEBHOOK_USERNAME,
    webhookPassword: env.PHONEPE_WEBHOOK_PASSWORD,
  };
}

/** Google Sign-In credentials, or `null` when the integration is not provisioned. */
export function googleAuthConfig() {
  const { GOOGLE_CLIENT_ID } = env;
  if (!GOOGLE_CLIENT_ID) return null;

  return { clientId: GOOGLE_CLIENT_ID };
}

export function shiprocketConfig() {
  const { SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD } = env;

  if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) return null;

  return {
    email: SHIPROCKET_EMAIL,
    password: SHIPROCKET_PASSWORD,
    channelId: env.SHIPROCKET_CHANNEL_ID,
    pickupLocation: env.SHIPROCKET_PICKUP_LOCATION,
    pickupPincode: env.SHIPROCKET_PICKUP_PINCODE,
    webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN,
    parcel: {
      lengthCm: env.SHIPROCKET_DEFAULT_LENGTH_CM,
      breadthCm: env.SHIPROCKET_DEFAULT_BREADTH_CM,
      heightCm: env.SHIPROCKET_DEFAULT_HEIGHT_CM,
      weightKg: env.SHIPROCKET_DEFAULT_WEIGHT_KG,
    },
  };
}

/** Same idea for SMTP: configured or explicitly absent, never half-set. */
export function smtpConfig() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return {
    host: SMTP_HOST,
    port: env.SMTP_PORT,
    user: SMTP_USER,
    pass: SMTP_PASS,
    secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
    allowInsecureTLS: !isProduction && env.SMTP_ALLOW_INSECURE_TLS,
    from: env.MAIL_FROM ?? SMTP_USER,
  };
}
