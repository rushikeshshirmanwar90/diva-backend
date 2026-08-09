import { route } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { pingDatabase } from "@/lib/db/connect";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import { isMailConfigured } from "@/lib/transpoter";
import { countUnpriced } from "@/repositories/product.repository";

/**
 * `GET /api/v1/health`
 *
 * Wired to PM2 and an external uptime monitor.
 *
 * It performs a real database ping rather than returning a static `{ok:true}`.
 * A health check that only proves the Node process is alive is worse than
 * useless — it stays green while every request 500s on a dead connection pool,
 * which is precisely when you need the alarm.
 *
 * Integration status is reported but does **not** fail the check: a store with
 * no Cloudinary key configured is incompletely set up, not down.
 */
export const GET = route(
  async () => {
    const startedAt = Date.now();
    const database = await pingDatabase();

    // Only meaningful once the database answered; a failed ping would make this
    // throw and turn an unhealthy report into a 500.
    const unpricedProducts = database.ok ? await countUnpriced() : null;

    return ok({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      database: { connected: database.ok, latencyMs: database.latencyMs },
      integrations: {
        cloudinary: isCloudinaryConfigured(),
        mail: isMailConfigured(),
      },
      // Surfaced here because a live product with no price cannot be bought and
      // nothing else would reveal it — the storefront just quietly refuses.
      unpricedProducts,
      checkedInMs: Date.now() - startedAt,
    });
  },
  // The handler pings the database itself; letting the wrapper connect first
  // would hide a connection failure behind a generic 503 instead of reporting
  // it as unhealthy.
  { skipDatabase: true },
);
