import { OrderModel, type OrderDocument } from "@/models/Order";
import type { OrderStatus } from "@/models/enums";
import type { QueryFilter, Types } from "mongoose";

export async function create(input: Partial<OrderDocument>) {
  const order = await OrderModel.create(input);
  return order.toObject();
}

export async function findById(id: string) {
  return OrderModel.findById(id).lean();
}

export async function findByNumber(orderNumber: string) {
  return OrderModel.findOne({ orderNumber: orderNumber.toUpperCase() }).lean();
}

/**
 * Loads an order and asserts ownership in the same query.
 *
 * Two separate steps — fetch, then compare `userId` — is the shape that grows
 * an IDOR the first time someone adds an early return between them. Making
 * ownership part of the filter means "not yours" and "does not exist" are the
 * same 404, which is also what you want: a distinct 403 confirms to a prober
 * that the order number is real.
 */
export async function findOwnedById(id: string, userId: string) {
  return OrderModel.findOne({ _id: id, userId }).lean();
}

export async function findOwnedByNumber(orderNumber: string, userId: string) {
  return OrderModel.findOne({ orderNumber: orderNumber.toUpperCase(), userId }).lean();
}

export async function listForUser(
  userId: string,
  options: { page: number; limit: number; status?: OrderStatus },
) {
  const filter: QueryFilter<OrderDocument> = { userId };
  if (options.status) filter.status = options.status;

  const [items, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    OrderModel.countDocuments(filter),
  ]);

  return { items, total };
}

export async function listForAdmin(options: {
  page: number;
  limit: number;
  status?: OrderStatus;
  search?: string;
}) {
  const filter: QueryFilter<OrderDocument> = {};
  if (options.status) filter.status = options.status;

  if (options.search) {
    // Anchored and escaped. An unescaped user string in a regex is both a
    // catastrophic-backtracking DoS and a way to match every order with `.*`.
    const safe = options.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { orderNumber: new RegExp(`^${safe}`, "i") },
      { customerEmail: new RegExp(`^${safe}`, "i") },
    ];
  }

  const [items, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    OrderModel.countDocuments(filter),
  ]);

  return { items, total };
}

/**
 * Moves an order to a new status, but only from an expected one.
 *
 * `expectedFrom` is the concurrency control. Two webhook deliveries racing each
 * other both read `PAYMENT_INITIATED`, both decide the transition is legal, and
 * both write — appending two status events and sending two confirmation emails.
 * Putting the current status in the *filter* means the database arbitrates:
 * the second update matches nothing and returns null, which the caller treats
 * as "already handled".
 */
export async function transition(
  orderId: string | Types.ObjectId,
  to: OrderStatus,
  expectedFrom: OrderStatus | OrderStatus[],
  event: {
    note?: string;
    actorId?: string;
    actorRole?: string;
    set?: Partial<OrderDocument>;
  } = {},
) {
  const from = Array.isArray(expectedFrom) ? expectedFrom : [expectedFrom];

  return OrderModel.findOneAndUpdate(
    { _id: orderId, status: { $in: from } },
    {
      $set: { status: to, ...(event.set ?? {}) },
      $push: {
        statusHistory: {
          status: to,
          at: new Date(),
          ...(event.note ? { note: event.note } : {}),
          ...(event.actorId ? { actorId: event.actorId } : {}),
          ...(event.actorRole ? { actorRole: event.actorRole } : {}),
        },
      },
    },
    { returnDocument: "after" },
  ).lean();
}

export async function attachPayment(orderId: string | Types.ObjectId, paymentId: Types.ObjectId) {
  return OrderModel.findByIdAndUpdate(
    orderId,
    { $set: { paymentId } },
    { returnDocument: "after" },
  ).lean();
}

export async function attachShipment(orderId: string | Types.ObjectId, shipmentId: Types.ObjectId) {
  return OrderModel.findByIdAndUpdate(
    orderId,
    { $set: { shipmentId } },
    { returnDocument: "after" },
  ).lean();
}

/**
 * Orders whose stock reservation has lapsed.
 *
 * Feeds the sweep that releases held inventory. Restricted to statuses where
 * money has not moved — a paid order is never swept, however old.
 */
export async function findExpiredReservations(limit = 100) {
  return OrderModel.find({
    status: { $in: ["PENDING", "PAYMENT_INITIATED", "PAYMENT_FAILED"] },
    reservationExpiresAt: { $ne: null, $lt: new Date() },
  })
    .limit(limit)
    .lean();
}

/** Sequence for the day, used to build `DIVA-YYYYMMDD-NNNN`. */
export async function countForDay(start: Date, end: Date): Promise<number> {
  return OrderModel.countDocuments({ createdAt: { $gte: start, $lt: end } });
}
