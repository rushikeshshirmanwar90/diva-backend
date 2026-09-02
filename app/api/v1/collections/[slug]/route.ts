import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { slugParam } from "@/validators/common";
import * as collectionService from "@/services/collection.service";
import { getPrincipal } from "@/lib/auth/session";

export const GET = route<{ slug: string }>(async ({ request, params }) => {
  const { slug } = parseParams(params, slugParam);
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  const data = await collectionService.getCollectionBySlug(slug, { isStaff });
  return NextResponse.json(
    { success: true, status: 200, message: "Collection fetched successfully", data },
    { status: 200 },
  );
});
