import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody, parseParams } from "@/lib/api/validate";
import { idParam } from "@/validators/common";
import { updateCollectionSchema } from "@/validators/catalog";
import * as collectionService from "@/services/collection.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const PATCH = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);
  const input = await parseBody(request, updateCollectionSchema);

  const collection = await collectionService.updateCollection(id, input);

  audit.record(audit.auditContext(request, principal), {
    action: "collection.update",
    entityType: "Collection",
    entityId: id,
    after: input as Record<string, unknown>,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Collection updated successfully", data: collection },
    { status: 200 },
  );
});

export const DELETE = route<{ id: string }>(async ({ request, params }) => {
  const principal = await requireStaff(request, "catalog:write");
  const { id } = parseParams(params, idParam);

  const data = await collectionService.deleteCollection(id);

  audit.record(audit.auditContext(request, principal), {
    action: "collection.delete",
    entityType: "Collection",
    entityId: id,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Collection deleted successfully", data },
    { status: 200 },
  );
});
