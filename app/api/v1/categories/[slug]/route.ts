import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { parseParams } from "@/lib/api/validate";
import { slugParam } from "@/validators/common";
import * as categoryService from "@/services/category.service";

export const GET = route<{ slug: string }>(async ({ params }) => {
  const { slug } = parseParams(params, slugParam);
  const data = await categoryService.getCategoryBySlug(slug);
  return NextResponse.json(
    { success: true, status: 200, message: "Category fetched successfully", data },
    { status: 200 },
  );
});
