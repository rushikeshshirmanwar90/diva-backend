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

  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };

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

    address: {
      line1: { type: String, default: "", trim: true },
      line2: { type: String, trim: true },
      city: { type: String, default: "", trim: true },
      state: { type: String, default: "", trim: true },
      pincode: { type: String, default: "", trim: true },
      country: { type: String, default: "India", trim: true },
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
