import { after } from "next/server";
import { transporter, isMailConfigured } from "@/lib/transpoter";
import { env, smtpConfig } from "@/config/env";
import { formatPaise, type Paise } from "@/lib/money";

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

/** A rendered template, still missing its recipient. */
export type MailBody = Omit<MailOptions, "to">;

function fromAddress(): string {
  const config = smtpConfig();
  return config ? `DIVA <${config.from}>` : "DIVA <noreply@diva.com>";
}

/**
 * Sends an email and waits for the result.
 *
 * Use this only when the user is genuinely blocked on the mail going out — the
 * signup OTP being the one real case. SMTP round-trips take hundreds of
 * milliseconds and will dominate the response time of anything else.
 */
export async function sendMailNow(options: MailOptions): Promise<void> {
  await transporter.sendMail({ from: fromAddress(), ...options });
}

/**
 * Hands an email off to be sent after the response has been flushed.
 *
 * Transactional mail must never sit in the request path. The rule that matters
 * most here: **a failed SMTP call must never fail a paid order.** The customer
 * has been charged; whether Gmail accepted our confirmation email is our
 * problem, not theirs. Failures are logged and swallowed.
 *
 * `after` keeps the work inside the server's request lifecycle, so it still
 * runs to completion rather than being killed mid-flight like a bare floating
 * promise would be.
 */
export function queueMail(options: MailOptions): void {
  if (!isMailConfigured()) {
    console.warn(`[mail] skipped "${options.subject}" — SMTP not configured`);
    return;
  }

  after(async () => {
    try {
      await sendMailNow(options);
    } catch (error) {
      console.error(`[mail] failed "${options.subject}" to ${options.to}:`, error);
    }
  });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Brand tokens, inlined.
 *
 * Email clients strip <style> blocks and know nothing about CSS variables or
 * Tailwind, so every rule has to be an inline attribute. Tables rather than
 * flexbox for the same reason — Outlook still renders with Word's engine.
 */
const GOLD = "#C9A227";
const CHARCOAL = "#1A1A1A";
const BEIGE = "#F8F5F0";
const MUTED = "#6B6B6B";

const shell = (body: string) => `
<div style="background:${BEIGE};padding:32px 16px;font-family:Georgia,'Times New Roman',serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E8E2D8">
    <tr>
      <td style="padding:28px 32px;border-bottom:2px solid ${GOLD};text-align:center">
        <div style="font-size:26px;letter-spacing:8px;color:${CHARCOAL};font-weight:600">DIVA</div>
        <div style="font-size:11px;letter-spacing:3px;color:${MUTED};margin-top:6px;text-transform:uppercase">Fine Jewellery</div>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;color:${CHARCOAL};font-size:15px;line-height:1.65">
        ${body}
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background:${BEIGE};font-size:12px;color:${MUTED};text-align:center;line-height:1.6">
        This is an automated message from DIVA — please do not reply.<br />
        <a href="${env.STOREFRONT_URL}" style="color:${GOLD};text-decoration:none">${env.STOREFRONT_URL.replace(/^https?:\/\//, "")}</a>
      </td>
    </tr>
  </table>
</div>`;

const button = (label: string, href: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
    <tr><td style="background:${CHARCOAL};padding:13px 30px">
      <a href="${href}" style="color:#ffffff;text-decoration:none;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif">${label}</a>
    </td></tr>
  </table>`;

/**
 * Escapes user-controlled values interpolated into email HTML.
 *
 * A customer whose display name is `<img onerror=...>` should not get that
 * rendered — and more practically, an unescaped `&` in a name silently breaks
 * the surrounding markup in stricter clients.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function otpEmail(name: string, otp: string): MailBody {
  return {
    subject: "Your DIVA verification code",
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:normal">Verify your email</h2>
      <p>Dear ${esc(name)},</p>
      <p>Use this code to confirm your email address:</p>
      <p style="font-size:34px;font-weight:600;letter-spacing:10px;color:${GOLD};margin:22px 0;font-family:Helvetica,Arial,sans-serif">${esc(otp)}</p>
      <p style="color:${MUTED};font-size:13px">
        The code expires in 15 minutes. If you did not create a DIVA account,
        you can safely ignore this email.
      </p>
    `),
  };
}

export function welcomeEmail(name: string): MailBody {
  return {
    subject: "Welcome to DIVA",
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:normal">Welcome, ${esc(name)}</h2>
      <p>Your account is verified and ready.</p>
      <p>Explore hallmarked gold, diamond and silver jewellery — crafted for
      everyday elegance and once-in-a-lifetime occasions.</p>
      ${button("Browse the collection", `${env.STOREFRONT_URL}/shop`)}
    `),
  };
}

export function passwordResetEmail(name: string, resetUrl: string): MailBody {
  return {
    subject: "Reset your DIVA password",
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:normal">Password reset</h2>
      <p>Dear ${esc(name)},</p>
      <p>Click below to choose a new password. The link is valid for 30 minutes
      and can be used once.</p>
      ${button("Reset password", resetUrl)}
      <p style="color:${MUTED};font-size:13px">
        If you did not request this, no action is needed — your password has not
        changed.
      </p>
    `),
  };
}

export function orderConfirmationEmail(input: {
  name: string;
  orderNumber: string;
  totalPaise: Paise;
  items: { title: string; quantity: number; pricePaise: Paise }[];
}): MailBody {
  const rows = input.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #EFEFEF">
          ${esc(item.title)}<br />
          <span style="color:${MUTED};font-size:13px">Qty ${item.quantity}</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #EFEFEF;text-align:right;white-space:nowrap">
          ${formatPaise(item.pricePaise)}
        </td>
      </tr>`,
    )
    .join("");

  return {
    subject: `DIVA order ${input.orderNumber} confirmed`,
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:normal">Thank you for your order</h2>
      <p>Dear ${esc(input.name)},</p>
      <p>We have received your order <strong>${esc(input.orderNumber)}</strong>
      and payment has been confirmed.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;font-size:14px">
        ${rows}
        <tr>
          <td style="padding:14px 0;font-weight:600">Total paid</td>
          <td style="padding:14px 0;text-align:right;font-weight:600;color:${GOLD}">
            ${formatPaise(input.totalPaise)}
          </td>
        </tr>
      </table>
      ${button("View your order", `${env.STOREFRONT_URL}/account/orders/${input.orderNumber}`)}
    `),
  };
}

export function shippingUpdateEmail(input: {
  name: string;
  orderNumber: string;
  status: string;
  courier?: string;
  awb?: string;
  trackingUrl?: string;
}): MailBody {
  const tracking =
    input.awb && input.courier
      ? `<p><strong>${esc(input.courier)}</strong> · AWB ${esc(input.awb)}</p>`
      : "";

  return {
    subject: `DIVA order ${input.orderNumber} — ${input.status.replace(/_/g, " ").toLowerCase()}`,
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:normal">Order update</h2>
      <p>Dear ${esc(input.name)},</p>
      <p>Your order <strong>${esc(input.orderNumber)}</strong> is now
      <strong>${esc(input.status.replace(/_/g, " ").toLowerCase())}</strong>.</p>
      ${tracking}
      ${input.trackingUrl ? button("Track shipment", input.trackingUrl) : ""}
    `),
  };
}
