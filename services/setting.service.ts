import * as settings from "@/repositories/setting.repository";
import type { UpdateSettingInput } from "@/validators/setting";

/** Fields safe to show on the storefront. Everything checkout-related stays server-side only. */
const PUBLIC_FIELDS = [
  "storeName",
  "supportEmail",
  "supportPhone",
  "whatsappNumber",
  "supportHours",
  "address",
  "social",
  "footerBlurb",
  "copyrightText",
  "paymentMethodsNote",
  "assurances",
  "contactPage",
  "faqs",
  "gstNumber",
  "bisLicenceNumber",
  "cinNumber",
] as const;

export async function getPublicSettings() {
  const doc = await settings.get();
  const result: Record<string, unknown> = {};
  for (const field of PUBLIC_FIELDS) result[field] = doc[field];
  return result;
}

/** Admin read: always fresh, so an edit made a moment ago on another tab isn't shadowed by cache. */
export async function getSettings() {
  return settings.get({ fresh: true });
}

export async function updateSettings(input: UpdateSettingInput) {
  return settings.update(input);
}
