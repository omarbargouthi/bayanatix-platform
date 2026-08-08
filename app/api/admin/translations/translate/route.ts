import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { translateBatch, translateCategory } from "@/lib/i18n-admin/translate-service";

// Body is either { keyIds: number[], languageCode } for a selection, or
// { categoryCode, languageCode } for "translate everything in this category"
// (the sequential building block behind the Translate-everything wizard).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { keyIds, categoryCode, languageCode } = body as { keyIds?: number[]; categoryCode?: string; languageCode?: string };
  if (!languageCode) return NextResponse.json({ error: "Missing languageCode" }, { status: 400 });

  const result = categoryCode
    ? await translateCategory(categoryCode, languageCode)
    : await translateBatch(Array.isArray(keyIds) ? keyIds : [], languageCode);

  return NextResponse.json(result);
}
