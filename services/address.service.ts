import { ApiError } from "@/lib/api/errors";
import * as addresses from "@/repositories/address.repository";
import type { AddressInput, UpdateAddressInput } from "@/validators/address";

/**
 * Address business logic.
 *
 * The one rule that lives here rather than in the repository: **making an
 * address default always means exactly one write of "unset the others" before
 * the write that sets this one.** The repository's `clearDefaultForUser` only
 * unsets; deciding *when* that happens is what keeps the partial unique index
 * from ever seeing two defaults, even for the instant between two requests.
 */

export async function list(userId: string) {
  return addresses.listForUser(userId);
}

export async function create(userId: string, input: AddressInput) {
  // The first address a customer saves becomes default without them having to
  // notice a checkbox — there is no meaningful choice when there is only one.
  const isFirstAddress = (await addresses.countForUser(userId)) === 0;
  const makeDefault = input.isDefault || isFirstAddress;

  if (makeDefault) {
    await addresses.clearDefaultForUser(userId);
  }

  return addresses.create(userId, { ...input, isDefault: makeDefault });
}

export async function update(id: string, userId: string, input: UpdateAddressInput) {
  const existing = await addresses.findOwned(id, userId);
  if (!existing) throw ApiError.notFound("We could not find that address.");

  if (input.isDefault) {
    await addresses.clearDefaultForUser(userId, id);
  }

  const updated = await addresses.update(id, userId, input);
  if (!updated) throw ApiError.notFound("We could not find that address.");

  return updated;
}

export async function remove(id: string, userId: string) {
  const removed = await addresses.softDelete(id, userId);
  if (!removed) throw ApiError.notFound("We could not find that address.");

  return { deleted: true };
}
