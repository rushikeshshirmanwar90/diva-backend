import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions } from "@/models/base";
import { ADDRESS_TYPES, type AddressType } from "@/models/enums";

/**
 * Customer shipping and billing addresses.
 *
 * Kept as its own collection rather than an array on the user, because
 * Shiprocket serviceability checks, pincode lookups and "deliver to this
 * address" all query addresses directly, and an embedded array cannot be
 * indexed usefully for that.
 *
 * Note that orders do **not** reference this collection at fulfilment time —
 * they snapshot the address. Editing a saved address must never rewrite where a
 * past parcel was sent.
 */

export interface AddressDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  label?: string;
  type: AddressType;
  fullName: string;
  phone: string;
  alternatePhone?: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new mongoose.Schema<AddressDocument>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, trim: true, maxlength: 40 },
    type: { type: String, enum: ADDRESS_TYPES, default: "HOME" },

    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    alternatePhone: { type: String, trim: true, maxlength: 20 },

    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    landmark: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },

    /** Six digits, Indian format. Drives serviceability and shipping zone. */
    pincode: {
      type: String,
      required: true,
      trim: true,
      match: [/^[1-9][0-9]{5}$/, "Enter a valid 6-digit Indian pincode"],
      index: true,
    },

    country: { type: String, default: "India", trim: true, maxlength: 60 },

    isDefault: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

/**
 * At most one default address per user.
 *
 * A partial unique index rather than application logic, because "set this one
 * default and unset the others" is two writes, and a crash between them leaves
 * two defaults. The database refuses the second one outright.
 */
addressSchema.index(
  { userId: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true, deletedAt: null } },
);

addressSchema.index({ userId: 1, deletedAt: 1, createdAt: -1 });

export const AddressModel: Model<AddressDocument> = defineModel("Address", addressSchema);
