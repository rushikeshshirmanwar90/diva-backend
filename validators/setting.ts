import { z } from "zod";

/**
 * Deliberately narrower than `SettingDocument`. Only the fields the admin
 * "Settings" screen edits — display contact/store info — are writable here.
 * Checkout-affecting numbers (shipping thresholds, price-lock window, GST
 * defaults) and `isMaintenanceMode` stay out of this surface; they need their
 * own, more careful review before they get a form.
 */

const addressSchema = z
  .object({
    line1: z.string().trim().min(1, "Add an address line").max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1, "Add a city").max(100).optional(),
    state: z.string().trim().min(1, "Add a state").max(100).optional(),
    pincode: z.string().trim().min(4, "Enter a valid pincode").max(10).optional(),
    country: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const socialSchema = z
  .object({
    instagram: z.string().trim().url("Enter a valid URL").max(300).optional().or(z.literal("")),
    facebook: z.string().trim().url("Enter a valid URL").max(300).optional().or(z.literal("")),
    youtube: z.string().trim().url("Enter a valid URL").max(300).optional().or(z.literal("")),
    pinterest: z.string().trim().url("Enter a valid URL").max(300).optional().or(z.literal("")),
  })
  .strict();

const assuranceItemSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(80),
    body: z.string().trim().min(1, "Description is required").max(300),
    icon: z.string().trim().max(40).optional(),
  })
  .strict();

const storeLocationSchema = z
  .object({
    city: z.string().trim().min(1, "City is required").max(60),
    tag: z.string().trim().max(40).optional().default("Counter"),
    address: z.string().trim().min(1, "Address is required").max(300),
    phone: z.string().trim().min(1, "Phone is required").max(40),
    hours: z.string().trim().min(1, "Hours are required").max(100),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

const contactPageSchema = z
  .object({
    eyebrow: z.string().trim().max(100).optional(),
    title: z.string().trim().max(100).optional(),
    description: z.string().trim().max(500).optional(),
    stores: z.array(storeLocationSchema).max(20).optional(),
  })
  .strict();

const faqItemSchema = z
  .object({
    q: z.string().trim().min(1, "Question is required").max(300),
    a: z.string().trim().min(1, "Answer is required").max(2000),
  })
  .strict();

const faqGroupSchema = z
  .object({
    group: z.string().trim().min(1, "Group name is required").max(80),
    items: z.array(faqItemSchema).min(1, "Add at least one question"),
  })
  .strict();

export const updateSettingSchema = z
  .object({
    storeName: z.string().trim().min(1, "Give the store a name").max(120).optional(),
    supportEmail: z.string().trim().email("Enter a valid email address").optional(),
    supportPhone: z.string().trim().min(6, "Enter a valid phone number").max(20).optional(),
    whatsappNumber: z.string().trim().min(6, "Enter a valid phone number").max(20).optional(),
    supportHours: z.string().trim().max(100).optional(),
    address: addressSchema.optional(),
    social: socialSchema.optional(),
    footerBlurb: z.string().trim().max(500).optional(),
    copyrightText: z.string().trim().max(200).optional(),
    paymentMethodsNote: z.string().trim().max(200).optional(),
    assurances: z.array(assuranceItemSchema).max(10).optional(),
    contactPage: contactPageSchema.optional(),
    faqs: z.array(faqGroupSchema).max(20).optional(),
  })
  .strict();

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
