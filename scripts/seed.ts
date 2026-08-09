/**
 * Database seed.
 *
 *   npm run seed            — ensures the superadmin account exists
 *   npm run seed -- --force — the above, and resets the password if it differs
 *
 * Deliberately minimal: this creates an account to sign in with and nothing
 * else. No categories, no collections, no products.
 *
 * Everything a store sells is business data, and seeding plausible-looking
 * business data is how invented prices and sample SKUs end up in a live
 * catalogue. The console is designed to be usable from empty — create the real
 * categories and products through the admin UI.
 *
 * Idempotent: running it twice changes nothing.
 * To wipe an already-populated database, see `npm run reset`.
 */

import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/connect";
import { hashPassword } from "@/lib/auth/password";
import { env } from "@/config/env";
import { UserModel } from "@/models";

const force = process.argv.includes("--force");

async function seedSuperadmin() {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("  superadmin: skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env)");
    return;
  }

  const existing = await UserModel.findOne({ email: email.toLowerCase() });

  if (existing) {
    if (!force) {
      console.info(`  superadmin: ${email} already exists`);
      console.info("  (run `npm run seed -- --force` to reset its password from .env)");
      return;
    }

    existing.passwordHash = await hashPassword(password);
    existing.role = "superadmin";
    existing.isActive = true;
    existing.deletedAt = null;
    /**
     * Bumping this invalidates every access token already signed for the
     * account. Without it, a session opened under the old password keeps
     * working for its full 15 minutes after a deliberate password reset.
     */
    existing.tokenVersion += 1;
    await existing.save();

    console.info(`  superadmin: password reset for ${email}`);
    return;
  }

  await UserModel.create({
    name: "DIVA Admin",
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    role: "superadmin",
    // Pre-verified: there is no inbox to check during a bootstrap.
    emailVerifiedAt: new Date(),
    isActive: true,
  });

  console.info(`  superadmin: created ${email}`);
}

async function main() {
  console.info("Seeding DIVA…");
  await connectToDatabase();

  await seedSuperadmin();

  console.info("Done.");
  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await disconnectFromDatabase();
  process.exit(1);
});
