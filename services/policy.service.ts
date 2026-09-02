import { ApiError } from "@/lib/api/errors";
import * as policies from "@/repositories/policy.repository";
import type { UpdatePolicyInput } from "@/validators/policy";

export async function getPolicy(slug: string) {
  if (!policies.isPolicySlug(slug)) throw ApiError.notFound("We could not find that policy.");
  const policy = await policies.findBySlug(slug);
  if (!policy) throw ApiError.notFound("We could not find that policy.");
  return policy;
}

export async function listPolicies() {
  return policies.listAll();
}

export async function updatePolicy(slug: string, input: UpdatePolicyInput) {
  if (!policies.isPolicySlug(slug)) throw ApiError.notFound("We could not find that policy.");
  const updated = await policies.updateBySlug(slug, input);
  if (!updated) throw ApiError.notFound("We could not find that policy.");
  return updated;
}
