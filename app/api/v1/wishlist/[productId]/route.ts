import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { productIdParam } from "@/validators/wishlist";
import * as wishlistService from "@/services/wishlist.service";
import { requireAuth } from "@/lib/auth/session";

export const DELETE = route<{ productId: string }>(async ({ request, params }) => {
  const principal = await requireAuth(request);
  const { productId } = parseParams(params, productIdParam);
  const data = await wishlistService.remove(principal.userId, productId);
  return NextResponse.json(
    { success: true, status: 200, message: "Removed from wishlist successfully", data },
    { status: 200 },
  );
});
