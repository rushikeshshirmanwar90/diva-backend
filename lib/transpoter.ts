import nodemailer from "nodemailer";
import type SMTPPool from "nodemailer/lib/smtp-pool";
import { smtpConfig } from "@/config/env";
import { ApiError } from "@/lib/api/errors";

/**
 * Typed against the *pooled* transport, because `pool: true` below changes the
 * `SentMessageInfo` shape. Aliasing the default SMTP transport here instead
 * produces a type error that reads as though nodemailer were misconfigured.
 */
type Transporter = nodemailer.Transporter<SMTPPool.SentMessageInfo>;

/**
 * Lazily-built SMTP transporter.
 *
 * Built on first use rather than at import time so that a backend with no mail
 * credentials still boots and serves the catalogue — mail is not on the
 * critical path for browsing. Credentials are read through `config/env.ts`, so
 * they are validated in one place instead of being re-parsed here.
 */
let instance: Transporter | null = null;

function createTransporter(): Transporter {
  const config = smtpConfig();

  if (!config) {
    throw ApiError.serviceUnavailable(
      "Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.",
    );
  }

  if (config.allowInsecureTLS) {
    console.warn("[mail] TLS certificate validation is DISABLED (development only)");
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Port 465 is implicit TLS; 587 and friends upgrade via STARTTLS.
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: {
      rejectUnauthorized: !config.allowInsecureTLS,
      // No `ciphers` override here: pinning 'SSLv3' — a common copy-paste —
      // forces an obsolete suite that Gmail and every modern relay refuse.
    },
    // Short enough that a wedged relay surfaces as a quick failure rather than
    // a minute-long hang holding a request open.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Reuse one connection for a burst of order emails.
    pool: true,
    maxConnections: 3,
  });
}

export function getTransporter(): Transporter {
  if (!instance) {
    instance = createTransporter();
  }
  return instance;
}

export function isMailConfigured(): boolean {
  return smtpConfig() !== null;
}

export const transporter = {
  sendMail: (...args: Parameters<Transporter["sendMail"]>) =>
    getTransporter().sendMail(...args),
  verify: (...args: Parameters<Transporter["verify"]>) => getTransporter().verify(...args),
};
