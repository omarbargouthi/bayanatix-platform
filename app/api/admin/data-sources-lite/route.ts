import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDataSourcesLite } from "@/lib/queries/catalog";

// Minimal {id, name} list — backs the Authentication settings' "restrict auto-
// provisioned Viewer access to specific data sources" picker.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listDataSourcesLite());
}
