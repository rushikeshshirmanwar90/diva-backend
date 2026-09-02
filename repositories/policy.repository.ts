import { PolicyModel, POLICY_SLUGS, type PolicyDocument, type PolicySlug } from "@/models/Policy";
import { DEFAULT_POLICIES } from "@/lib/policy-defaults";

export function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(value);
}

/**
 * Reads a policy, seeding it from `DEFAULT_POLICIES` on first read.
 *
 * Upsert rather than "read, and throw if missing", same reasoning as
 * `lib/settings.ts`: a fresh database should serve the shipping and returns
 * pages without a seed script having been run first.
 */
export async function findBySlug(slug: PolicySlug) {
  const existing = await PolicyModel.findOne({ slug }).lean();
  if (existing) return existing;

  return PolicyModel.findOneAndUpdate(
    { slug },
    { $setOnInsert: { slug, ...DEFAULT_POLICIES[slug] } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean();
}

export async function listAll() {
  await Promise.all(POLICY_SLUGS.map((slug) => findBySlug(slug)));
  return PolicyModel.find({}).sort({ slug: 1 }).lean();
}

export async function updateBySlug(slug: PolicySlug, update: Partial<PolicyDocument>) {
  await findBySlug(slug);
  return PolicyModel.findOneAndUpdate({ slug }, { $set: update }, { returnDocument: "after" }).lean();
}
