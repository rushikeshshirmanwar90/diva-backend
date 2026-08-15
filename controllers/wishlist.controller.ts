import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { parseBody, parseParams } from "@/lib/api/validate";
import { addWishlistItemSchema, productIdParam } from "@/validators/wishlist";
import * as wishlistService from "@/services/wishlist.service";
import { requireAuth } from "@/lib/auth/session";

/** HTTP shaping for the customer's wishlist. Every route requires auth. */

export async function list(request: NextRequest) {
  const principal = await requireAuth(request);
  return ok(await wishlistService.list(principal.userId));
}

export async function add(request: NextRequest) {
  const principal = await requireAuth(request);
  const { productId } = await parseBody(request, addWishlistItemSchema);

  return ok(await wishlistService.add(principal.userId, productId));
}

export async function remove(request: NextRequest, params: unknown) {
  const principal = await requireAuth(request);
  const { productId } = parseParams(params, productIdParam);

  return ok(await wishlistService.remove(principal.userId, productId));
}
