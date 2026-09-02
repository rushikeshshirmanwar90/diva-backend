import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { createCollectionSchema } from "@/validators/catalog";
import * as collectionService from "@/services/collection.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const POST = route(async ({ request }) => {
  const principal = await requireStaff(request, "catalog:write");
  const input = await parseBody(request, createCollectionSchema);

  const collection = await collectionService.createCollection(input);

  audit.record(audit.auditContext(request, principal), {
    action: "collection.create",
    entityType: "Collection",
    entityId: collection ? String(collection._id) : undefined,
    after: { name: input.name },
  });

  return NextResponse.json(
    { success: true, status: 201, message: "Collection created successfully", data: collection },
    { status: 201 },
  );
});
