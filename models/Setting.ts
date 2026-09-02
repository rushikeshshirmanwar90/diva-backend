import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, paiseField } from "@/models/base";

/**
 * Store settings — a singleton.
 *
 * Enforced by a fixed `key` with a unique index, so a bug that creates a second
 * settings document fails at the database rather than producing two configs
 * where whichever one a query happens to return decides the free-shipping
 * threshold.
 *
 * These belong in the database, not in environment variables, because a shop
 * owner changes the free-shipping threshold for a weekend sale and must not
 * need a redeploy to do it.
 */

export interface SettingDocument {
  _id: Types.ObjectId;
  key: "store";

  storeName: string;
  supportEmail: string;
  supportPhone: string;
  whatsappNumber?: string;
  supportHours?: string;

  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };

  footerBlurb?: string;
  copyrightText?: string;
  paymentMethodsNote?: string;

  assurances?: Array<{
    title: string;
    body: string;
    icon?: string;
  }>;

  contactPage?: {
    eyebrow?: string;
    title?: string;
    description?: string;
    stores?: Array<{
      city: string;
      tag: string;
      address: string;
      phone: string;
      hours: string;
      note?: string;
    }>;
  };

  faqs?: Array<{
    group: string;
    items: Array<{
      q: string;
      a: string;
    }>;
  }>;

  gstNumber?: string;
  /** Bureau of Indian Standards hallmarking licence, shown on invoices. */
  bisLicenceNumber?: string;
  cinNumber?: string;

  shipping: {
    freeShippingThresholdPaise: number;
    flatRatePaise: number;
    /** Pincode prefixes not served. Checked before checkout, not after. */
    blockedPincodePrefixes: string[];
    estimatedDaysMin: number;
    estimatedDaysMax: number;
  };

  pricing: {
    /**
     * Grace window during which a quoted price is honoured even if the metal
     * rate moves.
     *
     * Without it, a customer who loads a product page, thinks for ten minutes
     * and then checks out sees a different number at payment — which reads as a
     * bait-and-switch even though nothing dishonest happened.
     */
    priceLockMinutes: number;
    /** Default GST percent for items with none set. Confirm with an accountant. */
    defaultGstPercent: number;
    /** Default making charge for new variants, as a percentage. */
    defaultMakingChargePercent: number;
  };

  social: {
    instagram?: string;
    facebook?: string;
    youtube?: string;
    pinterest?: string;
  };

  returnWindowDays: number;
  isMaintenanceMode: boolean;
  maintenanceMessage?: string;

  createdAt: Date;
  updatedAt: Date;
}

const settingSchema = new mongoose.Schema<SettingDocument>(
  {
    key: { type: String, default: "store", enum: ["store"], required: true },

    storeName: { type: String, default: "DIVA", trim: true },
    supportEmail: { type: String, default: "support@diva.com", trim: true, lowercase: true },
    supportPhone: { type: String, default: "", trim: true },
    whatsappNumber: { type: String, trim: true },
    supportHours: { type: String, trim: true, default: "Mon–Sat, 9:00–21:00 IST" },

    address: {
      line1: { type: String, default: "", trim: true },
      line2: { type: String, trim: true },
      city: { type: String, default: "", trim: true },
      state: { type: String, default: "", trim: true },
      pincode: { type: String, default: "", trim: true },
      country: { type: String, default: "India", trim: true },
    },

    footerBlurb: {
      type: String,
      trim: true,
      default:
        "Fine jewellery made in Bengaluru and Jaipur since 1998. Every piece is hallmarked, priced transparently, and made to be worn — not stored.",
    },
    copyrightText: {
      type: String,
      trim: true,
      default: "© 2026 Diva The Indian Jewel Pvt. Ltd. · GSTIN 29AABCD1234E1ZQ",
    },
    paymentMethodsNote: {
      type: String,
      trim: true,
      default: "UPI · Cards · Net banking · No-cost EMI",
    },

    assurances: {
      type: [
        {
          title: { type: String, required: true, trim: true },
          body: { type: String, required: true, trim: true },
          icon: { type: String, trim: true },
        },
      ],
      default: [
        {
          title: "BIS hallmarked",
          body: "HUID on every gold piece, verifiable in the BIS Care app.",
          icon: "BadgeCheck",
        },
        {
          title: "Insured delivery",
          body: "Fully insured and tracked until it is signed for.",
          icon: "Truck",
        },
        {
          title: "15-day returns",
          body: "Plus one free size exchange within 30 days.",
          icon: "RotateCcw",
        },
        {
          title: "Lifetime care",
          body: "Free cleaning, polishing and re-rhodium plating.",
          icon: "ShieldCheck",
        },
      ],
    },

    contactPage: {
      eyebrow: { type: String, trim: true, default: "We answer in under four hours" },
      title: { type: String, trim: true, default: "Talk to a person" },
      description: {
        type: String,
        trim: true,
        default:
          "No chatbots. Messages reach the same team that handles the counters, and bridal enquiries go straight to a senior consultant.",
      },
      stores: {
        type: [
          {
            city: { type: String, required: true, trim: true },
            tag: { type: String, default: "Counter", trim: true },
            address: { type: String, required: true, trim: true },
            phone: { type: String, required: true, trim: true },
            hours: { type: String, required: true, trim: true },
            note: { type: String, trim: true },
          },
        ],
        default: [
          {
            city: "Bengaluru",
            tag: "Flagship",
            address: "12 Lavelle Road, Bengaluru 560001",
            phone: "+91 95798 96842",
            hours: "Mon–Sat 10:30–20:00 · Sun 11:00–18:00",
            note: "Bridal appointments and purity assays available here.",
          },
          {
            city: "Chennai",
            tag: "Counter",
            address: "48 Nungambakkam High Road, Chennai 600034",
            phone: "+91 95798 96842",
            hours: "Mon–Sat 10:30–20:00 · Sun closed",
            note: "Temple and 22K collections held in depth.",
          },
          {
            city: "Hyderabad",
            tag: "Counter",
            address: "9 Road No. 12, Banjara Hills, Hyderabad 500034",
            phone: "+91 95798 96842",
            hours: "Tue–Sun 11:00–20:00 · Mon closed",
            note: "Polki and diamond bridal, by appointment on weekends.",
          },
        ],
      },
    },

    faqs: {
      type: [
        {
          group: { type: String, required: true, trim: true },
          items: [
            {
              q: { type: String, required: true, trim: true },
              a: { type: String, required: true, trim: true },
            },
          ],
        },
      ],
      default: [],
    },

    gstNumber: { type: String, trim: true, uppercase: true },
    bisLicenceNumber: { type: String, trim: true },
    cinNumber: { type: String, trim: true, uppercase: true },

    shipping: {
      freeShippingThresholdPaise: paiseField({ default: 200000 }),
      flatRatePaise: paiseField({ default: 9900 }),
      blockedPincodePrefixes: { type: [String], default: [] },
      estimatedDaysMin: { type: Number, default: 3, min: 1 },
      estimatedDaysMax: { type: Number, default: 7, min: 1 },
    },

    pricing: {
      priceLockMinutes: { type: Number, default: 30, min: 0 },
      defaultGstPercent: { type: Number, default: 3, min: 0, max: 28 },
      defaultMakingChargePercent: { type: Number, default: 12, min: 0 },
    },

    social: {
      instagram: { type: String, trim: true },
      facebook: { type: String, trim: true },
      youtube: { type: String, trim: true },
      pinterest: { type: String, trim: true },
    },

    returnWindowDays: { type: Number, default: 7, min: 0 },
    isMaintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, trim: true, maxlength: 500 },
  },
  baseSchemaOptions,
);

settingSchema.index({ key: 1 }, { unique: true });

export const SettingModel: Model<SettingDocument> = defineModel("Setting", settingSchema);
