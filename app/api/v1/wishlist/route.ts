import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { addWishlistItemSchema } from "@/validators/wishlist";
import * as wishlistService from "@/services/wishlist.service";
import { requireAuth } from "@/lib/auth/session";

/** The customer's wishlist. Every route requires auth. */

export const GET = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const data = await wishlistService.list(principal.userId);
  return NextResponse.json(
    { success: true, status: 200, message: "Wishlist fetched successfully", data },
    { status: 200 },
  );
});

export const POST = route(async ({ request }) => {
  const principal = await requireAuth(request);
  const { productId } = await parseBody(request, addWishlistItemSchema);
  const data = await wishlistService.add(principal.userId, productId);
  return NextResponse.json(
    { success: true, status: 200, message: "Added to wishlist successfully", data },
    { status: 200 },
  );
});
