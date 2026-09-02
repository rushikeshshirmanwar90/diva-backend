import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import * as collectionService from "@/services/collection.service";
import { getPrincipal } from "@/lib/auth/session";

export const GET = route(async ({ request }) => {
  const principal = await getPrincipal(request);
  const isStaff = Boolean(principal && principal.role !== "customer");

  const data = await collectionService.listCollections({
    includeInactive: isStaff,
    // The public sees only campaigns that are live right now.
    liveOnly: !isStaff,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Collections fetched successfully", data },
    { status: 200 },
  );
});
