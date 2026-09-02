import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { updateSettingSchema } from "@/validators/setting";
import * as settingService from "@/services/setting.service";
import * as audit from "@/services/audit.service";
import { requireStaff } from "@/lib/auth/session";

export const GET = route(async ({ request }) => {
  await requireStaff(request, "settings:write");
  const data = await settingService.getSettings();
  return NextResponse.json(
    { success: true, status: 200, message: "Store settings fetched successfully", data },
    { status: 200 },
  );
});

export const PATCH = route(async ({ request }) => {
  const principal = await requireStaff(request, "settings:write");
  const input = await parseBody(request, updateSettingSchema);

  const updated = await settingService.updateSettings(input);

  audit.record(audit.auditContext(request, principal), {
    action: "setting.update",
    entityType: "Setting",
    entityId: updated ? String(updated._id) : undefined,
    after: input,
  });

  return NextResponse.json(
    { success: true, status: 200, message: "Store settings updated successfully", data: updated },
    { status: 200 },
  );
});
