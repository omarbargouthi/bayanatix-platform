import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWorkbenchRows, type WorkbenchRow } from "@/lib/queries/translations";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const languageCode = url.searchParams.get("lang");
  if (!languageCode) return NextResponse.json({ error: "Missing lang query param" }, { status: 400 });

  const categoryCode = url.searchParams.get("category") ?? undefined;
  const status = (url.searchParams.get("status") as WorkbenchRow["statusCode"] | null) ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;

  const rows = await getWorkbenchRows({ languageCode, categoryCode, status, search });
  return NextResponse.json(rows);
}
