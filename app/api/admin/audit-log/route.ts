import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const result = await searchAuditLog({
    assetType: sp.get("assetType") ?? undefined,
    userId:    sp.get("userId")    ?? undefined,
    from:      sp.get("from")      ?? undefined,
    to:        sp.get("to")        ?? undefined,
    q:         sp.get("q")         ?? undefined,
    page:      sp.get("page")  ? Number(sp.get("page"))  : 1,
    limit:     sp.get("limit") ? Number(sp.get("limit")) : 50,
  });

  return NextResponse.json(result);
}
