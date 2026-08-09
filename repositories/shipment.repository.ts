import { ShipmentModel, type ShipmentDocument } from "@/models/Shipment";
import type { Types } from "mongoose";

export async function create(input: Partial<ShipmentDocument>) {
  const shipment = await ShipmentModel.create(input);
  return shipment.toObject();
}

export async function findById(id: string | Types.ObjectId) {
  return ShipmentModel.findById(id).lean();
}

export async function findByOrderId(orderId: string | Types.ObjectId, isReturn = false) {
  return ShipmentModel.findOne({ orderId, isReturn }).lean();
}

export async function findByAwb(awbCode: string) {
  return ShipmentModel.findOne({ awbCode }).lean();
}

export async function update(id: string | Types.ObjectId, patch: Partial<ShipmentDocument>) {
  return ShipmentModel.findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after" }).lean();
}

/**
 * Appends courier scans, skipping ones already recorded.
 *
 * Couriers redeliver their whole scan history on every webhook, so a naive
 * `$push` grows the array without bound and makes the tracking timeline repeat
 * itself. Deduplication is on status plus timestamp because scan payloads carry
 * no id, and the same status genuinely recurs at different times ("in transit"
 * at three hubs) — so neither field alone is sufficient.
 */
export async function appendTrackingEvents(
  id: string | Types.ObjectId,
  events: Array<{ status: string; description?: string; location?: string; occurredAt: Date }>,
) {
  const shipment = await ShipmentModel.findById(id).lean();
  if (!shipment) return null;

  const seen = new Set(
    shipment.trackingEvents.map(
      (event) => `${event.status}@${new Date(event.occurredAt).getTime()}`,
    ),
  );

  const fresh = events.filter(
    (event) => !seen.has(`${event.status}@${event.occurredAt.getTime()}`),
  );

  if (fresh.length === 0) return shipment;

  return ShipmentModel.findByIdAndUpdate(
    id,
    {
      $push: {
        trackingEvents: {
          $each: fresh.map((event) => ({ ...event, receivedAt: new Date() })),
          // Kept in courier-time order so the UI can render the array directly.
          $sort: { occurredAt: 1 },
        },
      },
    },
    { returnDocument: "after" },
  ).lean();
}
