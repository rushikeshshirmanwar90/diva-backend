import mongoose from "mongoose";
import { env } from "@/config/env";

/**
 * Whether this process is one invocation of a serverless function rather than
 * a server that stays up. Vercel sets `VERCEL` on both the build and the
 * running function; AWS Lambda sets the second. Neither is set by `next start`
 * or by the Docker image in this repo.
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/**
 * MongoDB connection, cached across hot reloads.
 *
 * `next dev` re-evaluates modules on every edit. Without a cache that survives
 * module re-evaluation, each save opens a fresh connection pool, and after a
 * couple of dozen edits Atlas starts refusing connections. Stashing the promise
 * on `globalThis` — which is *not* re-created on reload — is the standard fix.
 *
 * The cached value is the in-flight promise, not the resolved connection. Two
 * requests arriving during startup must await the same connect() call rather
 * than racing to open two pools.
 */

type ConnectionCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var __divaMongoose: ConnectionCache | undefined;
}

const cache: ConnectionCache = globalThis.__divaMongoose ?? {
  conn: null,
  promise: null,
};

/**
 * Cached in every environment, not just development.
 *
 * The hot-reload story above is only half the reason. On a serverless host the
 * container is reused across invocations but module scope is *not* guaranteed
 * to be — and a pool rebuilt per invocation means a fresh TCP handshake plus
 * SCRAM auth (three round trips) before the first query of every request. That
 * is invisible locally, where the database is a few milliseconds away, and
 * brutal from a region that is 250ms from it.
 */
globalThis.__divaMongoose = cache;

/**
 * Fail fast on a query issued before the connection is up.
 *
 * Mongoose buffers such queries by default and resolves them once connected,
 * which sounds helpful but turns a dead database into requests that hang for
 * ten seconds and then fail anyway. We would rather the route handler throw
 * immediately and return a 503.
 */
mongoose.set("bufferCommands", false);
mongoose.set("strictQuery", true);

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env.DB_URL, {
        dbName: env.DB_NAME,
        bufferCommands: false,
        // Surface an unreachable cluster in seconds, not after the 30s default.
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        /**
         * One connection per instance when running serverless.
         *
         * A serverless deployment scales by *process*, not by pool: each
         * concurrent invocation is its own container with its own pool, and
         * Next bundles route handlers into separate functions on top of that.
         * A pool of 10 per instance therefore multiplies out to hundreds of
         * sockets against the database under ordinary traffic, which a single
         * self-hosted mongod runs out of file descriptors long before it runs
         * out of CPU. A long-running server (Docker, PM2) has the opposite
         * need — one process, many concurrent requests — so it keeps a real
         * pool.
         */
        maxPoolSize: isServerless ? 1 : 10,
        minPoolSize: isServerless ? 0 : 1,
        retryWrites: true,
      })
      .then((instance) => {
        console.info(`[db] connected to ${env.DB_NAME}`);
        return instance;
      })
      .catch((error: unknown) => {
        // Clear the cache so the next request retries instead of awaiting a
        // permanently rejected promise for the lifetime of the process.
        cache.promise = null;
        throw error;
      });
  }

  cache.conn = await cache.promise;

  // Importing the barrel here rather than at module top-level keeps model
  // registration on the same tick as the connection, so a route that only
  // touches one model still has every schema (and every index) registered.
  await import("@/models");

  return cache.conn;
}

/** Liveness probe for `GET /api/v1/health`. */
export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const startedAt = Date.now();
  await connectToDatabase();

  const admin = mongoose.connection.db?.admin();
  if (!admin) throw new Error("Database handle unavailable");

  await admin.ping();
  return { ok: true, latencyMs: Date.now() - startedAt };
}

/** Used by scripts (seed, reconciliation jobs) that must exit cleanly. */
export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  cache.conn = null;
  cache.promise = null;
}

export default connectToDatabase;
