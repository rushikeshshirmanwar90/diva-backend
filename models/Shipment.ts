import mongoose, { type Model, type Types } from "mongoose";
import { defineModel, baseSchemaOptions, paiseField } from "@/models/base";

/**
 * Shiprocket shipments.
 *
 * `trackingEvents` is append-only. Courier webhooks arrive out of order and
 * duplicated — a parcel can report "out for delivery" twice and "in transit"
 * after "out for delivery" — so events are recorded as they come and the order
 * status is derived from the newest *meaningful* one, rather than trusting the
 * latest payload to be the latest truth.
 */

const trackingEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    description: { type: String, maxlength: 500 },
    location: { type: String, maxlength: 200 },
    /** Timestamp reported by the courier, which may lag the delivery to us. */
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

export interface ShipmentDocument {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;

  shiprocketOrderId?: string;
  shiprocketShipmentId?: string;
  awbCode?: string;
  courierName?: string;
  courierId?: number;

  labelUrl?: string;
  invoiceUrl?: string;
  manifestUrl?: string;

  status: string;
  trackingUrl?: string;
  trackingEvents: mongoose.InferSchemaType<typeof trackingEventSchema>[];

  pickupScheduledAt?: Date;
  shippedAt?: Date;
  estimatedDeliveryAt?: Date;
  deliveredAt?: Date;

  weightGrams?: number;
  shippingChargePaise?: number;

  isReturn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const shipmentSchema = new mongoose.Schema<ShipmentDocument>(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },

    shiprocketOrderId: { type: String, trim: true },
    shiprocketShipmentId: { type: String, trim: true },
    /** Airway bill number — what a customer types into a courier's tracker. */
    /** Indexed once, below — not here; two declarations collide by name. */
    awbCode: { type: String, trim: true },
    courierName: { type: String, trim: true },
    courierId: { type: Number },

    labelUrl: { type: String, trim: true },
    invoiceUrl: { type: String, trim: true },
    manifestUrl: { type: String, trim: true },

    status: { type: String, default: "CREATED", required: true },
    trackingUrl: { type: String, trim: true },
    trackingEvents: { type: [trackingEventSchema], default: [] },

    pickupScheduledAt: { type: Date },
    shippedAt: { type: Date },
    estimatedDeliveryAt: { type: Date },
    deliveredAt: { type: Date },

    weightGrams: { type: Number, min: 0 },
    shippingChargePaise: paiseField(),

    /** Reverse pickups get their own shipment row against the same order. */
    isReturn: { type: Boolean, default: false },
  },
  baseSchemaOptions,
);

shipmentSchema.index({ orderId: 1, isReturn: 1 });
shipmentSchema.index({ awbCode: 1 }, { sparse: true });
shipmentSchema.index({ status: 1, createdAt: -1 });

export const ShipmentModel: Model<ShipmentDocument> = defineModel("Shipment", shipmentSchema);
