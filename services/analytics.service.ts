import mongoose from "mongoose";
import { ProductModel } from "@/models/Product";
import { ProductViewModel } from "@/models/ProductView";
import { notDeleted } from "@/models/base";
import type { ProductViewInput } from "@/validators/analytics";

/**
 * Storefront traffic.
 *
 * Recording is deliberately forgiving: a beacon for an unknown slug, or a
 * repeat within the dedupe window, is a quiet no-op rather than an error. The
 * browser fires these and forgets them — there is nobody to show a 4xx to,
 * and a failed beacon must never affect the page the customer is reading.
 */

/** A reload, or a bounce between the gallery and the buy box, is one visit. */
const DEDUPE_MINUTES = 30;

export async function recordProductView(
  slug: string,
  input: ProductViewInput,
  context: { userId?: string | null },
): Promise<{ recorded: boolean }> {
  const product = await ProductModel.findOne({ slug, ...notDeleted, status: "ACTIVE" })
    .select("_id slug")
    .lean();

  if (!product) return { recorded: false };

  const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000);
  const recent = await ProductViewModel.exists({
    visitorId: input.visitorId,
    productId: product._id,
    viewedAt: { $gte: since },
  });

  if (recent) return { recorded: false };

  await ProductViewModel.create({
    productId: product._id,
    productSlug: product.slug,
    visitorId: input.visitorId,
    userId: context.userId ? new mongoose.Types.ObjectId(context.userId) : undefined,
    referrerHost: referrerHost(input.referrer),
    viewedAt: new Date(),
  });

  return { recorded: true };
}

/** Just the host — the path of a referring page is nobody's business here. */
function referrerHost(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    return new URL(referrer).hostname || undefined;
  } catch {
    return undefined;
  }
}
