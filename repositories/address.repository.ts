import { AddressModel, type AddressDocument } from "@/models/Address";
import { notDeleted } from "@/models/base";

/**
 * Address persistence.
 *
 * Every read and write here takes a `userId` alongside the address id. That is
 * the ownership check — a filter that does not include it would let one
 * customer edit or delete another's saved address by guessing an id.
 */

export async function listForUser(userId: string) {
  return AddressModel.find({ userId, ...notDeleted })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
}

export async function findOwned(id: string, userId: string) {
  return AddressModel.findOne({ _id: id, userId, ...notDeleted }).lean();
}

export async function countForUser(userId: string): Promise<number> {
  return AddressModel.countDocuments({ userId, ...notDeleted });
}

export async function create(userId: string, input: Partial<AddressDocument>) {
  const address = await AddressModel.create({ ...input, userId });
  return address.toObject();
}

export async function update(id: string, userId: string, input: Partial<AddressDocument>) {
  return AddressModel.findOneAndUpdate(
    { _id: id, userId, ...notDeleted },
    { $set: input },
    { returnDocument: "after" },
  ).lean();
}

export async function softDelete(id: string, userId: string) {
  const result = await AddressModel.updateOne(
    { _id: id, userId, ...notDeleted },
    { $set: { deletedAt: new Date(), isDefault: false } },
  );
  return result.matchedCount > 0;
}

/**
 * Unsets every other default for this user.
 *
 * Called before setting a new default, never the reverse — the partial unique
 * index on `(userId, isDefault: true)` means two writes racing to set
 * different addresses default would otherwise deadlock against each other, not
 * merely against this one.
 */
export async function clearDefaultForUser(userId: string, exceptId?: string) {
  const filter: Record<string, unknown> = { userId, isDefault: true, ...notDeleted };
  if (exceptId) filter._id = { $ne: exceptId };

  await AddressModel.updateMany(filter, { $set: { isDefault: false } });
}
