/**
 * Checks that PhonePe and Shiprocket are actually provisioned.
 *
 *   npm run check:integrations
 *   npm run check:integrations -- --pincode=110001
 *
 * Every value in the `.env` block is one somebody typed off a dashboard, and a
 * wrong one does not announce itself: `phonePeConfig()` returning null looks
 * identical to a shop that has simply not enabled payments yet, and the first
 * report of it is a customer hitting a 503 at the pay button. This script is
 * how that becomes a thing you find out in ten seconds instead.
 *
 * It talks to both providers for real, but only through calls that cannot cost
 * anything: an OAuth token fetch and a Shiprocket login, plus one read-only
 * serviceability quote. No payment is created and no shipment is booked, so it
 * is safe to run against production credentials.
 *
 * No database connection — this is pure configuration, and being able to run it
 * against an unreachable cluster is the point.
 */

import { env } from "@/config/env";
import { phonePeConfig, shiprocketConfig } from "@/config/env";
import * as phonepe from "@/lib/payments/phonepe";
import * as shiprocket from "@/lib/shipping/shiprocket";

/** Destination for the serviceability probe. New Delhi unless told otherwise. */
const probePincode =
  process.argv.find((arg) => arg.startsWith("--pincode="))?.split("=")[1] ?? "110001";

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

let failures = 0;
let warnings = 0;

function heading(text: string) {
  console.info("");
  console.info(`  ${text}`);
  console.info(`  ${"-".repeat(text.length)}`);
}

/**
 * Never prints a value that could be a secret — only whether it is present.
 * A terminal is scrollback, and scrollback ends up in screenshots.
 */
function secret(name: string, value: string | undefined) {
  console.info(`    ${name.padEnd(30)} ${value ? "set" : "—"}`);
}

/**
 * `KEY=` with nothing after it parses as an empty string, not as absent, so a
 * bare `?? "—"` prints a blank line for a variable nobody has filled in. Every
 * consumer treats empty as unset; the display has to agree.
 */
function plain(name: string, value: string | number | undefined) {
  const shown = value === undefined || value === "" ? "—" : value;
  console.info(`    ${name.padEnd(30)} ${shown}`);
}

function ok(message: string) {
  console.info(`    ✓ ${message}`);
}

function warn(message: string) {
  warnings += 1;
  console.info(`    ⚠ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.info(`    ✗ ${message}`);
}

/** The useful half of an error, without a stack nobody reads. */
function reason(error: unknown): string {
  if (error instanceof Error) {
    // ApiError wraps the provider's own message in `cause`, which is the part
    // that says *why* — "client not found", "invalid credentials".
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) return cause.message;
    return error.message;
  }
  return String(error);
}

function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// ---------------------------------------------------------------------------
// PhonePe
// ---------------------------------------------------------------------------

async function checkPhonePe() {
  heading("PhonePe — Standard Checkout v2");

  const config = phonePeConfig();

  secret("PHONEPE_CLIENT_ID", env.PHONEPE_CLIENT_ID);
  secret("PHONEPE_CLIENT_SECRET", env.PHONEPE_CLIENT_SECRET);
  plain("PHONEPE_CLIENT_VERSION", env.PHONEPE_CLIENT_VERSION);
  plain("PHONEPE_ENV", env.PHONEPE_ENV);
  secret("PHONEPE_WEBHOOK_USERNAME", env.PHONEPE_WEBHOOK_USERNAME);
  secret("PHONEPE_WEBHOOK_PASSWORD", env.PHONEPE_WEBHOOK_PASSWORD);
  console.info("");

  if (!config) {
    fail(
      "Not configured — PHONEPE_CLIENT_ID and PHONEPE_CLIENT_SECRET are both required.",
    );
    console.info("      Until they are set, /api/v1/payments/* answers 503 and no");
    console.info("      order can be paid for. See INTEGRATIONS.md § PhonePe.");
    return;
  }

  try {
    const result = await phonepe.verifyCredentials();
    ok(
      `OAuth succeeded against ${result.environment} ` +
        `(token good for ${duration(result.expiresAtMs - Date.now())})`,
    );
  } catch (error) {
    fail(`OAuth failed: ${reason(error)}`);
    console.info("");
    console.info("      Most likely causes, in order:");
    console.info("        • PHONEPE_ENV does not match the credentials. Sandbox and");
    console.info("          production keys are separate and are not interchangeable.");
    console.info("        • PHONEPE_CLIENT_VERSION is stale. It increments every time");
    console.info("          the secret is rotated on the dashboard.");
    console.info("        • The secret was truncated on paste — they are long.");
    return;
  }

  /**
   * A payment can complete perfectly and still leave the order unpaid in our
   * database if the webhook cannot authenticate: the customer is charged, the
   * callback is rejected, and the order sits in PAYMENT_INITIATED until the
   * reconciliation sweep catches it. Worth a warning of its own.
   */
  if (!config.webhookUsername || !config.webhookPassword) {
    warn(
      "Webhook credentials unset — every PhonePe callback will be rejected.",
    );
    console.info("      Payments still settle, but only via the reconciliation sweep,");
    console.info("      so confirmation is delayed by up to its interval.");
  } else {
    ok("Webhook credentials present.");
  }

  console.info("");
  console.info(`      Register this URL on the dashboard's Webhooks screen:`);
  console.info(`        ${env.APP_URL}/api/v1/payments/phonepe/webhook`);
  console.info(`      Customers return to:`);
  console.info(`        ${env.STOREFRONT_URL}/checkout/payment-return`);

  if (config.environment === "PRODUCTION" && env.APP_URL.includes("localhost")) {
    warn(
      "PHONEPE_ENV is PRODUCTION but APP_URL is localhost — PhonePe cannot reach that.",
    );
  }
}

// ---------------------------------------------------------------------------
// Shiprocket
// ---------------------------------------------------------------------------

async function checkShiprocket() {
  heading("Shiprocket");

  const config = shiprocketConfig();

  secret("SHIPROCKET_EMAIL", env.SHIPROCKET_EMAIL);
  secret("SHIPROCKET_PASSWORD", env.SHIPROCKET_PASSWORD);
  plain("SHIPROCKET_PICKUP_LOCATION", env.SHIPROCKET_PICKUP_LOCATION);
  plain("SHIPROCKET_PICKUP_PINCODE", env.SHIPROCKET_PICKUP_PINCODE);
  plain("SHIPROCKET_CHANNEL_ID", env.SHIPROCKET_CHANNEL_ID);
  secret("SHIPROCKET_WEBHOOK_TOKEN", env.SHIPROCKET_WEBHOOK_TOKEN);
  console.info("");

  if (!config) {
    fail("Not configured — SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD are both required.");
    console.info("      Checkout still works: serviceability degrades to the shop's own");
    console.info("      shipping rules. Fulfilment is what breaks — no order can be");
    console.info("      pushed to a courier. See INTEGRATIONS.md § Shiprocket.");
    return;
  }

  try {
    const result = await shiprocket.verifyCredentials();
    ok("Login succeeded.");
    console.info(
      `      Shipping from pickup "${result.pickupLocation}"` +
        `${result.channelId ? ` on channel ${result.channelId}` : " (default channel)"}.`,
    );
    console.info("      Confirm that nickname exists under Settings → Pickup Addresses;");
    console.info("      a mismatch is only rejected when the first order is created.");
  } catch (error) {
    fail(`Login failed: ${reason(error)}`);
    console.info("");
    console.info("      Use the API user from Settings → API → Configure, not your");
    console.info("      own dashboard login — the two are separate accounts.");
    return;
  }

  if (!config.pickupPincode) {
    fail("SHIPROCKET_PICKUP_PINCODE is unset — serviceability answers 503 without it.");
  } else {
    await probeServiceability();
  }

  if (!config.webhookToken) {
    warn("SHIPROCKET_WEBHOOK_TOKEN unset — tracking callbacks will be rejected.");
    console.info("      Orders still ship; customers just stop seeing live tracking.");
  } else {
    ok("Webhook token present.");
    console.info(`      Register this URL on Shiprocket's webhook screen:`);
    console.info(`        ${env.APP_URL}/api/v1/shipping/webhook`);
  }
}

/**
 * One real quote, which is the only thing that proves the account can actually
 * ship: credentials can be valid while the pickup address is unverified or no
 * courier serves the route, and both of those surface here rather than at
 * checkout.
 */
async function probeServiceability() {
  try {
    const quote = await shiprocket.checkServiceability({
      deliveryPincode: probePincode,
      // ₹5,000. Couriers price on declared value, and quoting ₹0 can return a
      // courier list that a real jewellery order would not get.
      declaredValuePaise: 500_000,
    });

    if (!quote.serviceable) {
      warn(`No courier serves ${probePincode} from the configured pickup.`);
      console.info("      Try another pincode with --pincode=. If every pincode comes");
      console.info("      back empty, the pickup address is probably not yet verified.");
      return;
    }

    const cheapest = quote.cheapest!;
    ok(
      `${quote.couriers.length} courier(s) serve ${probePincode}; ` +
        `cheapest ${cheapest.courierName} at ₹${(cheapest.ratePaise / 100).toFixed(2)}` +
        `${cheapest.estimatedDays ? `, ~${cheapest.estimatedDays} days` : ""}.`,
    );
  } catch (error) {
    fail(`Serviceability check failed: ${reason(error)}`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.info("");
  console.info("  Integration check");
  console.info(`  backend:    ${env.APP_URL}`);
  console.info(`  storefront: ${env.STOREFRONT_URL}`);

  await checkPhonePe();
  await checkShiprocket();

  console.info("");

  if (failures > 0) {
    console.info(`  ${failures} problem(s), ${warnings} warning(s).`);
    console.info("  Fix the ✗ lines before enabling checkout on the storefront.");
    console.info("");
    process.exit(1);
  }

  if (warnings > 0) {
    console.info(`  Configured, with ${warnings} warning(s) above.`);
  } else {
    console.info("  Both integrations are configured and reachable.");
  }

  console.info("");
  console.info("  Next: set NEXT_PUBLIC_CHECKOUT_ENABLED=true in diva-frontend/.env.local");
  console.info("  and restart it, then place a test order.");
  console.info("");
}

main().catch((error) => {
  console.error("");
  console.error("  Check failed to run:", reason(error));
  console.error("");
  process.exit(1);
});
