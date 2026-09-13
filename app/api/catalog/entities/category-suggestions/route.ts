import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEntityCategorySuggestions } from "@/lib/queries/catalog";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const schemaId      = searchParams.get("schemaId");
  const dataSourceId  = searchParams.get("dataSourceId");
  const confirmed     = searchParams.get("confirmed");
  const page          = Number(searchParams.get("page") ?? "1");
  const limit         = Number(searchParams.get("limit") ?? "25");

  const { rows, total } = await getEntityCategorySuggestions({
    schemaId: schemaId ? Number(schemaId) : undefined,
    dataSourceId: dataSourceId ? Number(dataSourceId) : undefined,
    confirmed: confirmed === "true" ? true : confirmed === "false" ? false : undefined,
    page, limit,
  });

  return NextResponse.json({ data: rows, total, page, limit });
}
