/**
 * One-off: creates the starter category taxonomy.
 *
 *   npm run seed:categories
 *
 * Unlike `seed.ts`, this does add catalogue data — deliberately, at the
 * user's explicit request for a standard jewellery set to rename or extend
 * later from the admin panel. Kept out of `seed.ts` so that script's
 * environment-bootstrap contract (account only, no business data) stays true
 * for anyone who runs it without reading this file.
 *
 * Idempotent by slug: running it twice adds nothing a second time.
 */

import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/connect";
import { slugify } from "@/lib/slug";
import * as categories from "@/repositories/category.repository";
import { createCategory } from "@/services/category.service";

const STARTER_CATEGORIES = [
  "Rings",
  "Necklaces",
  "Earrings",
  "Bangles & Bracelets",
  "Pendants",
  "Anklets",
];

async function main() {
  console.info("Seeding starter categories…");
  await connectToDatabase();

  for (const [index, name] of STARTER_CATEGORIES.entries()) {
    const slug = slugify(name);
    const existing = await categories.findBySlug(slug);

    if (existing) {
      console.info(`  ${name}: already exists (${slug})`);
      continue;
    }

    await createCategory({
      name,
      displayOrder: index,
      isActive: true,
      isFeatured: false,
    } as never);

    console.info(`  ${name}: created (${slug})`);
  }

  console.info("Done.");
  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error("Seeding categories failed:", error);
  await disconnectFromDatabase();
  process.exit(1);
});
