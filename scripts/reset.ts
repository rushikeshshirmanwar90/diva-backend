/**
 * Destructive database reset.
 *
 *   npm run reset            — dry run: lists what would be deleted
 *   npm run reset -- --yes   — actually deletes it
 *
 * Drops every collection in the target database, then recreates the superadmin
 * from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. The result is an empty catalogue
 * with exactly one account able to sign in.
 *
 * The dry run is the default on purpose. This script points at whatever DB_URL
 * happens to be in `.env`, and that is as easily a production cluster as a
 * scratch one — so the destructive path has to be typed deliberately, and the
 * host and database name are printed before anything is touched.
 */

import mongoose from "mongoose";
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/connect";
import { hashPassword } from "@/lib/auth/password";
import { env } from "@/config/env";
import { UserModel } from "@/models";

const confirmed = process.argv.includes("--yes");

/** Host only — DB_URL carries the password and must not reach a log. */
function safeHost(): string {
  try {
    return new URL(env.DB_URL).host;
  } catch {
    return "(unparseable DB_URL)";
  }
}

async function main() {
  await connectToDatabase();

  const db = mongoose.connection.db;
  if (!db) throw new Error("No database handle after connect.");

  const collections = await db.listCollections().toArray();

  const counts = await Promise.all(
    collections.map(async (collection) => ({
      name: collection.name,
      count: await db.collection(collection.name).countDocuments(),
    })),
  );

  const populated = counts.filter((entry) => entry.count > 0);
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);

  console.info("");
  console.info(`  cluster:  ${safeHost()}`);
  console.info(`  database: ${env.DB_NAME}`);
  console.info("");

  if (collections.length === 0) {
    console.info("  Database is already empty.");
  } else {
    console.info(`  ${collections.length} collection(s), ${total} document(s):`);
    for (const entry of populated.sort((a, b) => b.count - a.count)) {
      console.info(`    ${entry.name.padEnd(24)} ${String(entry.count).padStart(6)}`);
    }
    if (populated.length === 0) console.info("    (all empty)");
  }

  console.info("");

  if (!confirmed) {
    console.info("  DRY RUN — nothing was deleted.");
    console.info("  Re-run with `npm run reset -- --yes` to delete all of the above.");
    console.info("");
    await disconnectFromDatabase();
    return;
  }

  for (const collection of collections) {
    await db.collection(collection.name).drop();
    console.info(`  dropped ${collection.name}`);
  }

  /**
   * Dropping a collection drops its indexes with it. Mongoose only builds
   * indexes when a model is first registered, which already happened above, so
   * without this the unique constraint on `email` would be silently absent —
   * and a duplicate account could then be created.
   */
  for (const model of Object.values(mongoose.models)) {
    await model.syncIndexes();
  }
  console.info(`  rebuilt indexes on ${Object.keys(mongoose.models).length} model(s)`);

  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("");
    console.warn("  ⚠  No superadmin created — SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are unset.");
    console.warn("     The database is now empty and nobody can sign in.");
  } else {
    await UserModel.create({
      name: "DIVA Admin",
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      role: "superadmin",
      emailVerifiedAt: new Date(),
      isActive: true,
    });
    console.info("");
    console.info(`  superadmin: created ${email}`);
  }

  console.info("");
  console.info("  Done. The catalogue is empty — create categories in /admin/categories");
  console.info("  and enter today's metal rates in /admin/rates before adding products.");
  console.info("");

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error("Reset failed:", error);
  await disconnectFromDatabase();
  process.exit(1);
});
