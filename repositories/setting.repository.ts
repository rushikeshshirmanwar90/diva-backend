import { SettingModel } from "@/models/Setting";
import { getStoreSettings, invalidateSettingsCache } from "@/lib/settings";
import type { UpdateSettingInput } from "@/validators/setting";

export async function get(options: { fresh?: boolean } = {}) {
  return getStoreSettings(options);
}

/**
 * Flattens `address`/`social` onto dot paths before the update.
 *
 * `$set: { address: input.address }` would replace the whole embedded
 * document, so editing just `supportPhone` — or just `address.city` — would
 * silently wipe out every other address field the admin did not touch.
 */
function toDotPaths(input: UpdateSettingInput): Record<string, unknown> {
  const set: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if ((key === "address" || key === "social") && value && typeof value === "object") {
      for (const [subKey, subValue] of Object.entries(value)) {
        set[`${key}.${subKey}`] = subValue;
      }
    } else {
      set[key] = value;
    }
  }

  return set;
}

export async function update(input: UpdateSettingInput) {
  const updated = await SettingModel.findOneAndUpdate(
    { key: "store" },
    { $set: toDotPaths(input), $setOnInsert: { key: "store" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean();

  invalidateSettingsCache();
  return updated;
}
