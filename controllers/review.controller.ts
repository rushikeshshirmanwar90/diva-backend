import type { NextRequest } from "next/server";
import { ok, created, paginationMeta } from "@/lib/api/response";
import { parseBody, parseQuery, parseParams } from "@/lib/api/validate";
import { idParam, slugParam } from "@/validators/common";
import {
  createReviewSchema,
  listReviewsSchema,
  listMyReviewsSchema,
  listReviewsForAdminSchema,
  moderateReviewSchema,
  replyToReviewSchema,
} from "@/validators/review";
import * as reviewService from "@/services/review.service";
import * as audit from "@/services/audit.service";
import { requireAuth, requireStaff } from "@/lib/auth/session";
import { clientIp, userAgent } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/api/rate-limit";

/**
 * HTTP shaping for reviews.
 *
 * The split matters: reading approved reviews is public, writing one requires a
 * signed-in customer, and moderating requires staff. Those are three different
 * audiences on the same collection.
 */

/** `GET /products/{slug}/reviews` — public, approved only. */
export async function listForProduct(request: NextRequest, params: unknown) {
  const { slug } = parseParams(params, slugParam);
  const query = parseQuery(request, listReviewsSchema);

  const result = await reviewService.listForProduct(slug, query);

  return ok(result.items, {
    meta: {
      ...paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
      // The product-wide average travels with the page so a client rendering
      // the summary block does not need a second request for two numbers.
      summary: result.summary,
    },
  });
}

/**
 * `POST /reviews` — a signed-in customer reviews a product.
 *
 * Rate limited per account as well as per IP: writing reviews is cheap, and a
 * compromised account posting across the catalogue is the abuse this stops.
 */
export async function submitReview(request: NextRequest) {
  const principal = await requireAuth(request);
  await enforceRateLimit("review", principal.userId);

  const input = await parseBody(request, createReviewSchema);
  const result = await reviewService.submitReview(input, principal.userId);

  return created(result);
}

/** `GET /reviews/mine` — a signed-in customer's own reviews, any status. */
export async function listMine(request: NextRequest) {
  const principal = await requireAuth(request);
  const query = parseQuery(request, listMyReviewsSchema);

  const result = await reviewService.listForUser(principal.userId, query);

  return ok(result.items, {
    meta: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
  });
}

/** `DELETE /reviews/{id}` — a customer withdraws their own review. */
export async function deleteReview(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);

  return ok(await reviewService.deleteReview(id, principal.userId));
}

/** `POST /reviews/{id}/helpful` — one vote per account. */
export async function markHelpful(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { id } = parseParams(params, idParam);

  return ok(await reviewService.markHelpful(id, principal.userId));
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

/** `GET /admin/reviews` — the moderation queue, the only view that sees PENDING. */
export async function listForAdmin(request: NextRequest) {
  await requireStaff(request, "review:moderate");
  const query = parseQuery(request, listReviewsForAdminSchema);

  const result = await reviewService.listForAdmin(query);

  return ok(result.items, {
    meta: paginationMeta({ page: query.page, limit: query.limit, total: result.total }),
  });
}

export async function moderateReview(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "review:moderate");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, moderateReviewSchema);

  const review = await reviewService.moderateReview(id, input, principal.userId);

  // Always audited: publishing or suppressing a customer's words is a decision
  // someone must be able to answer for later.
  audit.record(
    {
      principal,
      ip: clientIp(request),
      userAgent: userAgent(request),
      requestId: request.headers.get("x-request-id") ?? undefined,
    },
    {
      action: `review.${input.status.toLowerCase()}`,
      entityType: "Review",
      entityId: id,
      after: { status: input.status, rejectionReason: input.rejectionReason },
    },
  );

  return ok(review);
}

export async function replyToReview(request: NextRequest, params: unknown) {
  const principal = await requireStaff(request, "review:moderate");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, replyToReviewSchema);

  return ok(await reviewService.replyToReview(id, input.body, principal.userId));
}
